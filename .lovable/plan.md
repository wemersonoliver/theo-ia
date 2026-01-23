

## Plano: Sistema de Calendário e Agendamento para IA

### Objetivo
Implementar um sistema de calendário integrado que permite à IA agendar consultas, reuniões ou atendimentos diretamente via WhatsApp. Ideal para clínicas médicas, escritórios de advocacia, consultórios, salões de beleza e outros negócios que dependem de agendamentos.

---

### Visão Geral da Arquitetura

```text
+------------------+     +-------------------+     +------------------+
|  WhatsApp Msg    | --> |   AI Agent        | --> |  appointments    |
|  "Quero agendar" |     |   (Gemini)        |     |  (nova tabela)   |
+------------------+     +-------------------+     +------------------+
                               |
                               v
                    +---------------------+
                    |  Function Calling   |
                    |  (Tool: schedule)   |
                    +---------------------+
                               |
                               v
                    +---------------------+
                    |  manage-appointment |
                    |  (Edge Function)    |
                    +---------------------+
```

---

### Passo 1: Criar Tabela de Agendamentos

**Nova tabela: `appointments`**

```sql
CREATE TABLE public.appointments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  contact_name TEXT,
  title TEXT NOT NULL,
  description TEXT,
  appointment_date DATE NOT NULL,
  appointment_time TIME NOT NULL,
  duration_minutes INTEGER DEFAULT 30,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'cancelled', 'completed')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Index para queries por data
CREATE INDEX idx_appointments_user_date ON public.appointments(user_id, appointment_date);
CREATE INDEX idx_appointments_phone ON public.appointments(user_id, phone);

-- RLS Policy
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own appointments"
  ON public.appointments FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Trigger para updated_at
CREATE TRIGGER update_appointments_updated_at
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

---

### Passo 2: Tabela de Configuracao de Horarios Disponiveis

**Nova tabela: `appointment_slots`**

```sql
CREATE TABLE public.appointment_slots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  slot_duration_minutes INTEGER DEFAULT 30,
  max_appointments_per_slot INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, day_of_week, start_time)
);

ALTER TABLE public.appointment_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own slots"
  ON public.appointment_slots FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

---

### Passo 3: Criar Edge Function para Gerenciar Agendamentos

**Novo arquivo: `supabase/functions/manage-appointment/index.ts`**

Esta funcao sera chamada pela IA via function calling para:
- Verificar horarios disponiveis
- Criar novos agendamentos
- Cancelar/reagendar

```typescript
// Operacoes suportadas:
// - check_availability: { date: string }
// - create_appointment: { phone, contact_name, date, time, title, description? }
// - cancel_appointment: { appointment_id }
// - list_appointments: { phone?, date? }
```

---

### Passo 4: Atualizar AI Agent com Function Calling

**Modificar: `supabase/functions/whatsapp-ai-agent/index.ts`**

Adicionar suporte a function calling do Gemini para que a IA possa:

1. Reconhecer intencao de agendamento
2. Consultar horarios disponiveis
3. Criar o agendamento
4. Confirmar com o cliente

```typescript
// Definir tools para o Gemini
const tools = [{
  functionDeclarations: [{
    name: "check_available_slots",
    description: "Verifica horarios disponiveis para agendamento em uma data especifica",
    parameters: {
      type: "object",
      properties: {
        date: { type: "string", description: "Data no formato YYYY-MM-DD" }
      },
      required: ["date"]
    }
  }, {
    name: "create_appointment",
    description: "Cria um novo agendamento",
    parameters: {
      type: "object",
      properties: {
        date: { type: "string", description: "Data no formato YYYY-MM-DD" },
        time: { type: "string", description: "Horario no formato HH:MM" },
        title: { type: "string", description: "Tipo de servico ou consulta" },
        description: { type: "string", description: "Detalhes adicionais" }
      },
      required: ["date", "time", "title"]
    }
  }, {
    name: "cancel_appointment",
    description: "Cancela um agendamento existente",
    parameters: {
      type: "object",
      properties: {
        date: { type: "string" },
        time: { type: "string" }
      },
      required: ["date", "time"]
    }
  }]
}];
```

---

### Passo 5: Criar Pagina de Calendario

**Novo arquivo: `src/pages/Appointments.tsx`**

Interface para visualizar e gerenciar agendamentos:

- Visao de calendario mensal/semanal
- Lista de agendamentos do dia
- Detalhes de cada agendamento
- Status (agendado, confirmado, cancelado, concluido)
- Filtros por data e status

Componentes:
- Calendario visual usando `react-day-picker`
- Lista de agendamentos do dia selecionado
- Modal de detalhes do agendamento
- Botoes para confirmar/cancelar/concluir

---

### Passo 6: Criar Pagina de Configuracao de Horarios

**Novo arquivo: `src/pages/AppointmentSettings.tsx`** (ou aba em Settings)

Permite configurar:
- Dias da semana disponiveis
- Horario de inicio e fim por dia
- Duracao padrao dos slots
- Intervalo entre agendamentos

---

### Passo 7: Atualizar Navegacao

**Modificar: `src/components/Sidebar.tsx`**

Adicionar novo item de menu:
```typescript
{ to: "/appointments", icon: Calendar, label: "Agendamentos" }
```

**Modificar: `src/App.tsx`**

Adicionar novas rotas:
```typescript
<Route path="/appointments" element={<ProtectedRoute><Appointments /></ProtectedRoute>} />
```

---

### Passo 8: Criar Hook para Agendamentos

**Novo arquivo: `src/hooks/useAppointments.ts`**

```typescript
export function useAppointments() {
  // Lista agendamentos com filtros
  // Cria/atualiza/cancela agendamentos
  // Realtime subscription para atualizacoes
}

export function useAppointmentSlots() {
  // Gerencia horarios disponiveis
}
```

---

### Passo 9: Atualizar Dashboard com Metricas

**Modificar: `src/pages/Dashboard.tsx`**

Adicionar cards:
- Agendamentos hoje
- Proximos agendamentos
- Agendamentos da semana

---

### Resumo dos Arquivos

| Arquivo | Acao |
|---------|------|
| **SQL Migration** | Criar tabelas `appointments` e `appointment_slots` |
| **manage-appointment/index.ts** | Nova Edge Function |
| **whatsapp-ai-agent/index.ts** | Adicionar function calling |
| **Appointments.tsx** | Nova pagina de calendario |
| **useAppointments.ts** | Novo hook |
| **Sidebar.tsx** | Adicionar menu |
| **App.tsx** | Adicionar rota |
| **Dashboard.tsx** | Adicionar metricas |

---

### Fluxo de Agendamento via WhatsApp

```text
Cliente: "Quero agendar uma consulta para amanha"
         |
         v
IA: [Detecta intencao de agendamento]
    [Chama check_available_slots({ date: "2026-01-24" })]
         |
         v
IA: "Temos horarios disponiveis amanha:
     - 09:00
     - 10:00
     - 14:00
     - 15:30
     Qual horario prefere?"
         |
         v
Cliente: "10 horas"
         |
         v
IA: [Chama create_appointment({ date, time: "10:00", title: "Consulta" })]
         |
         v
IA: "Pronto! Sua consulta foi agendada para amanha, 
     dia 24/01 as 10:00. Posso ajudar em algo mais?"
```

---

### Consideracoes Tecnicas

1. **Timezone**: Usar fuso horario do Brasil (America/Sao_Paulo)
2. **Conflitos**: Verificar disponibilidade antes de criar
3. **Lembretes**: Futuro - enviar lembrete 24h antes
4. **Cancelamento**: Cliente pode cancelar via WhatsApp

