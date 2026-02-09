

## Plano: Lembretes Automaticos de Agendamento + Sistema de Tags + Configuracoes

### Resumo

Implementar 3 funcionalidades:
1. **Lembretes automaticos via WhatsApp** antes do agendamento (com logica inteligente para horarios do inicio do dia)
2. **Sistema de tags** para status do agendamento (realizado, confirmado, etc.) gerenciadas pela IA
3. **Aba de configuracao** para definir quantas horas antes enviar o lembrete

---

### 1. Alteracoes no Banco de Dados

**Tabela `whatsapp_ai_config`** - Adicionar colunas:

| Coluna | Tipo | Default | Descricao |
|--------|------|---------|-----------|
| `reminder_enabled` | boolean | false | Ativa/desativa lembretes |
| `reminder_hours_before` | integer | 2 | Horas antes do agendamento para enviar lembrete |
| `reminder_message_template` | text | (template padrao) | Mensagem customizavel do lembrete |

**Tabela `appointments`** - Adicionar colunas:

| Coluna | Tipo | Default | Descricao |
|--------|------|---------|-----------|
| `reminder_sent` | boolean | false | Se o lembrete ja foi enviado |
| `reminder_sent_at` | timestamptz | null | Quando o lembrete foi enviado |
| `confirmed_by_client` | boolean | false | Se o cliente confirmou presenca |
| `tags` | text[] | '{}' | Tags do agendamento (ex: "confirmado", "realizado", "no-show") |

---

### 2. Nova Edge Function: `send-appointment-reminders`

Sera chamada periodicamente (via cron job a cada 5 minutos). Logica:

```text
Para cada agendamento com status "scheduled" e reminder_sent = false:

1. Calcular horario do lembrete:
   - lembrete_hora = appointment_time - reminder_hours_before

2. Se lembrete_hora < business_hours_start do dia:
   - Enviar no dia ANTERIOR, 2h antes do fim do expediente
   - Ex: consulta 08:00, lembrete 2h antes = 06:00 (fora do horario)
   - Entao envia no dia anterior as 16:00 (se expediente termina 18:00)

3. Se lembrete_hora >= business_hours_start:
   - Enviar normalmente no horario calculado

4. Enviar mensagem via Evolution API
5. Marcar reminder_sent = true
```

**Mensagem padrao:**
> "Ola {nome}! Lembrando que voce tem um agendamento amanha/hoje as {hora}. Por favor, confirme sua presenca respondendo SIM ou informe se precisa reagendar."

---

### 3. Atualizar `whatsapp-ai-agent` - Processar Confirmacoes

Adicionar ao system prompt instrucoes para:
- Quando o cliente responder ao lembrete com "sim", "confirmo", "confirmado", etc.: usar uma nova tool `confirm_appointment` para marcar o agendamento como confirmado e adicionar tag "confirmado"
- Quando o agendamento for realizado: a IA (ou o operador) pode marcar como "realizado" adicionando a tag

Nova tool para o Gemini:

| Tool | Descricao |
|------|-----------|
| `confirm_appointment` | Confirma presenca do cliente no agendamento |
| `update_appointment_tags` | Adiciona/remove tags de um agendamento |

---

### 4. Atualizar `manage-appointment` - Novas Operacoes

Adicionar operacoes:
- `confirm_appointment`: Atualiza status para "confirmed", adiciona tag "confirmado", marca `confirmed_by_client = true`
- `update_tags`: Adiciona ou remove tags de um agendamento

---

### 5. Frontend - Nova Aba "Lembretes" nas Configuracoes do Agente

Na pagina `AIAgent.tsx`, adicionar nova tab "Lembretes" com:
- Switch para ativar/desativar lembretes
- Input numerico para "Horas antes do agendamento" (1-24h)
- Textarea para template da mensagem de lembrete
- Explicacao da logica inteligente (horarios do inicio do dia)

---

### 6. Frontend - Tags nos Agendamentos

Na pagina `Appointments.tsx`:
- Exibir tags como badges coloridas ao lado do status
- Adicionar opcao no dropdown de acoes para adicionar/remover tags
- Tags disponiveis: "confirmado", "realizado", "no-show", "reagendado"

---

### 7. Cron Job para Lembretes

SQL para criar o cron job que chama `send-appointment-reminders` a cada 5 minutos:

```sql
SELECT cron.schedule(
  'send-appointment-reminders',
  '*/5 * * * *',
  $$ SELECT net.http_post(...) $$
);
```

---

### Arquivos a Criar/Modificar

| Arquivo | Acao |
|---------|------|
| Migration SQL | Adicionar colunas ao banco |
| `supabase/functions/send-appointment-reminders/index.ts` | **Criar** - Edge function de lembretes |
| `supabase/functions/manage-appointment/index.ts` | **Modificar** - Adicionar operacoes confirm e tags |
| `supabase/functions/whatsapp-ai-agent/index.ts` | **Modificar** - Novas tools + prompt atualizado |
| `src/pages/AIAgent.tsx` | **Modificar** - Nova aba "Lembretes" |
| `src/pages/Appointments.tsx` | **Modificar** - Exibir tags |
| `src/hooks/useAIConfig.ts` | **Modificar** - Novas propriedades |
| `src/hooks/useAppointments.ts` | **Modificar** - Novas propriedades |
| Cron Job SQL | Agendar execucao periodica |

---

### Fluxo Completo do Lembrete

```text
Cron (cada 5 min)
     |
     v
send-appointment-reminders
     |
     v
Busca agendamentos proximos (reminder_sent = false)
     |
     v
Para cada agendamento:
  - Calcula horario ideal do lembrete
  - Se horario ideal < inicio expediente:
      -> Envia no dia anterior (2h antes do fim)
  - Se esta na hora:
      -> Envia mensagem via Evolution API
      -> Marca reminder_sent = true
     |
     v
Cliente recebe: "Ola! Lembrando do seu agendamento..."
     |
     v
Cliente responde: "Sim, confirmo"
     |
     v
whatsapp-ai-agent detecta confirmacao
     |
     v
Usa tool confirm_appointment
     |
     v
manage-appointment: status = "confirmed", tag = "confirmado"
     |
     v
IA responde: "Otimo! Sua presenca esta confirmada."
```

