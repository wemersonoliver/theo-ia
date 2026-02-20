
## Remover a Aba "Pré-Atendimento" do Agente IA

### O que será removido

Na página `src/pages/AIAgent.tsx`, vou limpar tudo relacionado ao Pré-Atendimento:

**1. No estado inicial (`useState`)**
- `pre_service_active`
- `initial_message_1`
- `initial_message_2`
- `initial_message_3`
- `delay_between_messages`

**2. No `useEffect` (carregamento do config)**
- As mesmas 5 propriedades acima

**3. Na lista de abas (`TabsList`)**
- As 2 entradas duplicadas do `TabsTrigger` com `value="preservice"` (linhas 148 e 150)

**4. O bloco inteiro `<TabsContent value="preservice">` (linhas 385–468)**
- Card com Switch de ativação
- Campos Mensagem 1, 2 e 3
- Campo Delay entre mensagens
- Botão Salvar

**5. Import não mais utilizado**
- O ícone `MessageSquare` do `lucide-react` (usado apenas nessa aba)

### O que permanece intacto
- Aba Geral
- Aba Horário
- Aba Gatilhos
- Aba Lembretes

### Arquivo modificado
- `src/pages/AIAgent.tsx`
