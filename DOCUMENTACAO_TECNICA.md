# Documentação Técnica Completa — Theo IA

> Documento para replicação e debug do projeto em um novo ambiente Supabase.

---

## 1. VISÃO GERAL DA ARQUITETURA

- **Frontend**: React 18 + Vite + TypeScript + Tailwind CSS + shadcn/ui
- **Backend**: Supabase (Auth, Database, Storage, Edge Functions)
- **IA**: Google Gemini 2.0 Flash (via API direta)
- **WhatsApp**: Evolution API (instância externa)
- **Autenticação**: Supabase Auth com email/password
- **RBAC**: Tabela `user_roles` com enum `app_role` (`super_admin`, `admin`, `user`)

---

## 2. VARIÁVEIS DE AMBIENTE (.env do Frontend)

O arquivo `.env` é **auto-gerado** e contém:

```
VITE_SUPABASE_PROJECT_ID="<project_id>"
VITE_SUPABASE_PUBLISHABLE_KEY="<anon_key>"
VITE_SUPABASE_URL="https://<project_id>.supabase.co"
```

**IMPORTANTE**: Este arquivo NÃO deve ser editado manualmente. Ele é atualizado automaticamente pela integração Lovable Cloud.

---

## 3. SECRETS DO BACKEND (Edge Functions)

Todos acessíveis via `Deno.env.get("NOME")` nas Edge Functions:

| Secret | Descrição | Usado por |
|--------|-----------|-----------|
| `SUPABASE_URL` | URL do projeto Supabase (auto) | Todas as Edge Functions |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave Service Role (auto) | Todas as Edge Functions |
| `SUPABASE_ANON_KEY` | Chave anônima (auto) | `create-whatsapp-instance`, `admin-users` |
| `SUPABASE_PUBLISHABLE_KEY` | Alias da anon key (auto) | — |
| `SUPABASE_DB_URL` | URL direta do banco (auto) | — |
| `GOOGLE_GEMINI_API_KEY` | API Key do Google Gemini | `whatsapp-ai-agent`, `interview-ai-agent`, `prompt-generator-ai`, `test-ai-prompt` |
| `EVOLUTION_API_URL` | URL da Evolution API | `create-whatsapp-instance`, `disconnect-whatsapp-instance`, `refresh-whatsapp-qrcode`, `send-whatsapp-message`, `send-appointment-reminders` |
| `EVOLUTION_API_KEY` | API Key da Evolution API | Mesmos acima |
| `GROQ_API_KEY` | API Key do Groq (transcrição) | `transcribe-audio` |
| `LOVABLE_API_KEY` | Chave interna Lovable (auto) | — |

### Secrets de Migração (podem ser removidos após migração):
| Secret | Descrição |
|--------|-----------|
| `NEW_SUPABASE_URL` | URL completa do novo projeto (`https://xxx.supabase.co`) |
| `NEW_SUPABASE_SERVICE_ROLE_KEY` | Service Role Key do novo projeto |

---

## 4. TABELAS DO BANCO DE DADOS

### 4.1 Tabelas e Constraints UNIQUE

| Tabela | Constraint UNIQUE | Descrição |
|--------|-------------------|-----------|
| `profiles` | `user_id` | Perfil do usuário (1:1) |
| `user_roles` | `(user_id, role)` | Roles RBAC |
| `contacts` | `(user_id, phone)` | Contatos por proprietário |
| `whatsapp_instances` | `user_id` | Uma instância por usuário |
| `whatsapp_conversations` | `(user_id, phone)` | Uma conversa por contato por usuário |
| `whatsapp_ai_config` | `user_id` | Uma config IA por usuário |
| `whatsapp_ai_sessions` | `(user_id, phone)` | Uma sessão IA por contato |
| `whatsapp_pending_responses` | `(user_id, phone)` | Debounce de respostas IA |
| `appointments` | — | Agendamentos |
| `appointment_slots` | — | Horários disponíveis |
| `notification_contacts` | — | Contatos de notificação |
| `knowledge_base_documents` | — | Documentos base conhecimento |
| `platform_settings` | `user_id` | Configurações por usuário |
| `entrevistas_config` | — | Config de entrevistas IA |

### 4.2 RLS (Row Level Security)

**TODAS as tabelas têm RLS habilitado.** Padrão geral:

- **Maioria das tabelas**: Policy `ALL` com `auth.uid() = user_id`
- **`user_roles`**: Super admins gerenciam todas; usuários leem apenas seus roles
- **`profiles`**: SELECT, INSERT e UPDATE separados (sem DELETE)

### 4.3 Functions do Banco

```sql
-- Verificação de role (SECURITY DEFINER - evita recursão RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

-- Auto-criação de role ao registrar usuário
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$ BEGIN INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user'); RETURN NEW; END; $$;

-- Auto-criação de perfil ao registrar usuário
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$ BEGIN INSERT INTO public.profiles (user_id, email, full_name) VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))); RETURN NEW; END; $$;

-- Auto-update de updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
```

### 4.4 Triggers CRÍTICOS

**ATENÇÃO**: Os triggers abaixo devem estar vinculados à tabela `auth.users`. Precisam ser criados via SQL Editor com privilégios de superusuário:

```sql
-- Trigger para criar perfil automaticamente
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger para criar role automaticamente
CREATE TRIGGER on_auth_user_created_role
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();
```

**Se estes triggers não existirem**, novos usuários NÃO terão perfil nem role criados, causando erros de autenticação e acesso.

### 4.5 Enum

```sql
CREATE TYPE public.app_role AS ENUM ('super_admin', 'admin', 'user');
```

---

## 5. STORAGE

| Bucket | Público | Uso |
|--------|---------|-----|
| `knowledge-base` | Não | Documentos da base de conhecimento (PDF, TXT, etc.) |

---

## 6. EDGE FUNCTIONS

### 6.1 Configuração (supabase/config.toml)

As seguintes funções têm `verify_jwt = false` (validam auth internamente):

```toml
[functions.create-whatsapp-instance]
verify_jwt = false

[functions.disconnect-whatsapp-instance]
verify_jwt = false

[functions.refresh-whatsapp-qrcode]
verify_jwt = false

[functions.whatsapp-webhook]
verify_jwt = false

[functions.whatsapp-ai-agent]
verify_jwt = false

[functions.send-whatsapp-message]
verify_jwt = false

[functions.process-knowledge-document]
verify_jwt = false

[functions.manage-appointment]
verify_jwt = false

[functions.send-appointment-reminders]
verify_jwt = false

[functions.interview-ai-agent]
verify_jwt = false
```

### 6.2 Mapa de Edge Functions

| Função | Secrets Necessários | Descrição |
|--------|---------------------|-----------|
| `whatsapp-webhook` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Recebe webhooks da Evolution API (mensagens, QR Code, conexão) |
| `whatsapp-ai-agent` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_GEMINI_API_KEY` | Processa mensagens com IA Gemini + function calling para agendamentos |
| `create-whatsapp-instance` | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `EVOLUTION_API_URL`, `EVOLUTION_API_KEY` | Cria/conecta instância WhatsApp na Evolution API |
| `disconnect-whatsapp-instance` | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `EVOLUTION_API_URL`, `EVOLUTION_API_KEY` | Desconecta instância WhatsApp |
| `refresh-whatsapp-qrcode` | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `EVOLUTION_API_URL`, `EVOLUTION_API_KEY` | Gera novo QR Code |
| `send-whatsapp-message` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `EVOLUTION_API_URL`, `EVOLUTION_API_KEY` | Envia mensagens via WhatsApp |
| `process-pending-ai` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Processa respostas IA pendentes (sistema de debounce) |
| `transcribe-audio` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY`, `EVOLUTION_API_URL`, `EVOLUTION_API_KEY` | Transcreve áudios recebidos via WhatsApp |
| `process-image-ocr` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_GEMINI_API_KEY`, `EVOLUTION_API_URL`, `EVOLUTION_API_KEY` | Extrai texto de imagens (OCR via Gemini) |
| `process-knowledge-document` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Processa documentos da base de conhecimento |
| `manage-appointment` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `EVOLUTION_API_URL`, `EVOLUTION_API_KEY` | CRUD de agendamentos + notificações |
| `send-appointment-reminders` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `EVOLUTION_API_URL`, `EVOLUTION_API_KEY` | Envia lembretes automáticos de agendamento |
| `admin-users` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` | Gestão admin (listar, bloquear, alterar senha, exportar) |
| `interview-ai-agent` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_GEMINI_API_KEY` | Entrevistas com IA para gerar prompt personalizado |
| `prompt-generator-ai` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_GEMINI_API_KEY` | Gera prompt final com base na entrevista |
| `test-ai-prompt` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_GEMINI_API_KEY` | Testa prompt de IA em sandbox |
| `migrate-data` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `NEW_SUPABASE_URL`, `NEW_SUPABASE_SERVICE_ROLE_KEY` | Migração de dados entre projetos |

---

## 7. FLUXO DE DADOS — WhatsApp + IA

```
Usuário WhatsApp
       │
       ▼
Evolution API ──webhook──► whatsapp-webhook (Edge Function)
       │                        │
       │                        ├── Salva mensagem em whatsapp_conversations
       │                        ├── Se áudio → chama transcribe-audio
       │                        ├── Se imagem → chama process-image-ocr
       │                        └── Se IA ativa → agenda via whatsapp_pending_responses
       │                                              │
       │                                              ▼ (após delay)
       │                               process-pending-ai
       │                                              │
       │                                              ▼
       │                               whatsapp-ai-agent
       │                                    │
       │                                    ├── Consulta whatsapp_ai_config
       │                                    ├── Consulta knowledge_base_documents
       │                                    ├── Consulta whatsapp_conversations (histórico)
       │                                    ├── Chama Gemini API (function calling)
       │                                    │     ├── check_available_slots → manage-appointment
       │                                    │     ├── create_appointment → manage-appointment
       │                                    │     ├── cancel_appointment → manage-appointment
       │                                    │     ├── list_appointments → manage-appointment
       │                                    │     ├── confirm_appointment → manage-appointment
       │                                    │     └── update_appointment_tags → manage-appointment
       │                                    ├── Salva sessão em whatsapp_ai_sessions
       │                                    └── Envia resposta via send-whatsapp-message
       │                                              │
       ◄──────────────────────────────────────────────┘
```

---

## 8. FLUXO DE NOTIFICAÇÕES

Quando ocorre **handoff** (transferência para humano):
1. `whatsapp-ai-agent` chama função `notifyHandoff()`
2. Busca contatos em `notification_contacts` onde `notify_handoffs = true`
3. Envia mensagem via `send-whatsapp-message` para cada contato

Quando ocorre **agendamento**:
1. `manage-appointment` chama função `notifyAppointment()`
2. Busca contatos em `notification_contacts` onde `notify_appointments = true`
3. Envia mensagem via `send-whatsapp-message`

---

## 9. ROTAS DO FRONTEND

| Rota | Componente | Acesso |
|------|-----------|--------|
| `/` | LandingPage | Público |
| `/login` | Login | Público |
| `/register` | Register | Público |
| `/dashboard` | Dashboard | Autenticado |
| `/whatsapp` | WhatsApp | Autenticado |
| `/ai-agent` | AIAgent | Autenticado |
| `/knowledge-base` | KnowledgeBase | Autenticado |
| `/conversations` | Conversations | Autenticado |
| `/contacts` | Contacts | Autenticado |
| `/appointments` | Appointments | Autenticado |
| `/appointment-settings` | AppointmentSettings | Autenticado |
| `/settings` | Settings | Autenticado |
| `/admin` | AdminUsers | Super Admin |
| `/admin/export` | AdminExport | Super Admin |

---

## 10. HOOKS PRINCIPAIS (Frontend → Supabase)

| Hook | Tabela | Operações |
|------|--------|-----------|
| `useAuth` | `auth.users` + `profiles` | Login, registro, logout |
| `useWhatsAppInstance` | `whatsapp_instances` | CRUD + Realtime |
| `useAIConfig` | `whatsapp_ai_config` | Leitura/escrita config IA |
| `useConversations` | `whatsapp_conversations` | Listagem + Realtime |
| `useContacts` | `contacts` | CRUD contatos |
| `useAppointments` | `appointments` | CRUD agendamentos |
| `useKnowledgeBase` | `knowledge_base_documents` + Storage | Upload/delete documentos |
| `useNotificationContacts` | `notification_contacts` | CRUD contatos notificação |
| `usePlatformSettings` | `platform_settings` | Config plataforma |

---

## 11. REALTIME (Subscriptions)

| Tabela | Canal | Filtro |
|--------|-------|--------|
| `whatsapp_instances` | `whatsapp-instance-changes` | `user_id=eq.{userId}` |
| `whatsapp_conversations` | `whatsapp-conversations-changes` | `user_id=eq.{userId}` |

---

## 12. WEBHOOK EVOLUTION API

A Evolution API deve enviar webhooks para:

```
https://<SUPABASE_URL>/functions/v1/whatsapp-webhook
```

Eventos configurados:
- `MESSAGES_UPSERT` — Novas mensagens
- `CONNECTION_UPDATE` — Mudanças de conexão
- `QRCODE_UPDATED` — Atualização do QR Code

Configuração é feita automaticamente pela edge function `create-whatsapp-instance` ao criar a instância.

---

## 13. CHECKLIST DE CONFIGURAÇÃO DO NOVO PROJETO

### 13.1 Secrets obrigatórios
- [ ] `GOOGLE_GEMINI_API_KEY` — Obter em https://aistudio.google.com/apikey
- [ ] `EVOLUTION_API_URL` — URL da sua instância Evolution API (ex: `https://api.evolution.com.br`)
- [ ] `EVOLUTION_API_KEY` — API Key da Evolution API
- [ ] `GROQ_API_KEY` — Obter em https://console.groq.com/keys

### 13.2 Banco de Dados
- [ ] Criar enum `app_role`
- [ ] Criar todas as 14 tabelas com constraints UNIQUE corretos
- [ ] Habilitar RLS em TODAS as tabelas
- [ ] Criar todas as policies RLS
- [ ] Criar as 4 database functions
- [ ] Criar os 2 triggers em `auth.users` (via SQL Editor)

### 13.3 Storage
- [ ] Criar bucket `knowledge-base` (privado)
- [ ] Configurar policies de storage para upload/download por `user_id`

### 13.4 Edge Functions
- [ ] Deploy de todas as 16 edge functions
- [ ] Configurar `verify_jwt = false` no `config.toml` para as funções listadas

### 13.5 Auth
- [ ] Confirmar que auto-confirm de email está conforme desejado
- [ ] Verificar que os triggers `on_auth_user_created` estão funcionando

---

## 14. ERROS COMUNS E SOLUÇÕES

### Erro: "Nenhum perfil encontrado" / Página em branco após login
**Causa**: Triggers `handle_new_user` e `handle_new_user_role` não estão configurados em `auth.users`.
**Solução**: Criar os triggers via SQL Editor (Seção 4.4).

### Erro: "permission denied for table user_roles"
**Causa**: RLS não está configurado corretamente ou função `has_role` não existe.
**Solução**: Criar a função `has_role` com `SECURITY DEFINER`.

### Erro: "duplicate key value violates unique constraint"
**Causa**: Tentativa de inserir registro duplicado (ex: dois perfis para o mesmo user_id).
**Solução**: Usar `upsert` com `onConflict` adequado. Verificar constraints UNIQUE.

### Erro: Edge Function retorna 500
**Causa comum**: Secret não configurado.
**Solução**: Verificar se todos os secrets necessários estão configurados (Seção 3).

### Erro: WhatsApp não conecta / QR Code não aparece
**Causa**: `EVOLUTION_API_URL` ou `EVOLUTION_API_KEY` incorretos.
**Solução**: Verificar URL (sem barra final) e API Key da Evolution.

### Erro: IA não responde
**Causa**: `GOOGLE_GEMINI_API_KEY` não configurado ou inválido.
**Solução**: Verificar a key e cota da API.

### Erro: "relation does not exist"
**Causa**: Tabela não foi criada no novo banco.
**Solução**: Executar as migrações SQL para criar todas as tabelas.

### Erro: Áudio não transcrito
**Causa**: `GROQ_API_KEY` não configurado.
**Solução**: Adicionar o secret.

---

## 15. DEPENDÊNCIAS DO PROJETO (package.json)

Principais:
- `@supabase/supabase-js` ^2.91.0
- `@tanstack/react-query` ^5.83.0
- `react-router-dom` ^6.30.1
- `recharts` ^2.15.4
- `date-fns` ^3.6.0
- `lucide-react` ^0.462.0
- `sonner` ^1.7.4
- shadcn/ui (via Radix UI)

---

*Documento gerado em: 2026-02-26*
*Projeto: Theo IA — Sistema de Atendimento WhatsApp com IA*
