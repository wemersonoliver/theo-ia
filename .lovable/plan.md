

## Plano: Corrigir Bug de Function Calling e Garantir Agendamento Funcional

### Problema Identificado

Analisando a conversa com 554799491328, identifiquei o problema:

```text
Cliente: "isso" (confirmando agendamento)
IA enviou: print(default_api.check_available_slots(date='2026-01-27'))
Cliente: "o que é isso?"
IA: "Desculpe pela mensagem anterior..."
```

**Causa Raiz**: O modelo Gemini está gerando texto com sintaxe Python/código ao invés de usar a estrutura `functionCall` do Gemini. O código atual não filtra essa resposta e envia diretamente ao cliente.

**Resultado**: Nenhum agendamento foi criado no banco de dados.

---

### Solucao Completa

A correção envolve modificar `supabase/functions/whatsapp-ai-agent/index.ts` para:

#### 1. Detectar Codigo na Resposta

Adicionar funcao para identificar se a resposta contem sintaxe de codigo:

```typescript
function containsFunctionCallCode(text: string): boolean {
  const codePatterns = [
    /print\s*\(/i,
    /default_api\./i,
    /check_available_slots\s*\(/i,
    /create_appointment\s*\(/i,
    /cancel_appointment\s*\(/i,
    /list_appointments\s*\(/i,
    /\w+_api\.\w+\s*\(/i,
    /```[\s\S]*```/,
  ];
  return codePatterns.some(pattern => pattern.test(text));
}
```

#### 2. Extrair Function Call de Texto

Adicionar funcao para tentar recuperar a chamada de funcao do texto:

```typescript
function extractFunctionCallFromText(text: string): { name: string; args: Record<string, string> } | null {
  const patterns = [
    /(check_available_slots|create_appointment|cancel_appointment|list_appointments)\s*\(\s*([^)]*)\)/i
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const funcName = match[1];
      const argsStr = match[2];
      const args: Record<string, string> = {};
      
      const argMatches = argsStr.matchAll(/(\w+)\s*=\s*['"]?([^'",)]+)['"]?/g);
      for (const argMatch of argMatches) {
        args[argMatch[1]] = argMatch[2].trim();
      }
      
      return { name: funcName, args };
    }
  }
  return null;
}
```

#### 3. Modificar Loop de Processamento

No loop principal (linhas 269-343), apos obter a resposta de texto:

```typescript
// Verificar se o texto contem codigo de function call
const textPart = content.parts.find((p: any) => p.text);
if (textPart) {
  const responseText = textPart.text;
  
  // Detectar se a resposta contem codigo
  if (containsFunctionCallCode(responseText)) {
    console.log("Detected code in response, attempting to extract function call");
    
    const extracted = extractFunctionCallFromText(responseText);
    
    if (extracted) {
      // Executar a funcao extraida
      console.log("Extracted function:", extracted.name, extracted.args);
      
      const functionResult = await executeFunction(supabase, supabaseUrl, extracted.name, {
        ...extracted.args,
        userId,
        phone,
        contactName,
      });
      
      // Adicionar ao contexto e continuar
      geminiPayload.contents.push({
        role: "model",
        parts: [{ functionCall: { name: extracted.name, args: extracted.args } }]
      });
      geminiPayload.contents.push({
        role: "user",
        parts: [{
          functionResponse: {
            name: extracted.name,
            response: functionResult,
          }
        }]
      });
      
      functionCallsProcessed++;
      continue; // Continuar loop para obter resposta natural
    } else {
      // Nao conseguiu extrair, pedir nova resposta
      geminiPayload.contents.push({
        role: "user",
        parts: [{ 
          text: "Responda APENAS em linguagem natural para o cliente. NAO use codigo, funcoes print(), ou sintaxe de programacao. Use as ferramentas disponibilizadas pelo sistema." 
        }]
      });
      continue;
    }
  }
  
  // Resposta normal, usar
  aiReply = responseText;
}
```

#### 4. Melhorar System Prompt

Adicionar instrucoes mais explicitas no prompt do sistema (linha 216-240):

```typescript
const systemPrompt = `...

REGRAS CRITICAS - NUNCA VIOLE:
- NUNCA escreva codigo Python, JavaScript ou qualquer linguagem
- NUNCA use print(), default_api, ou sintaxe de funcao no texto
- NUNCA envie comandos tecnicos para o cliente
- Use APENAS as ferramentas (tools) disponibilizadas pelo sistema
- Responda SEMPRE em linguagem natural e conversacional
- Quando precisar verificar disponibilidade ou criar agendamento, use as tools, nao escreva codigo

...`;
```

---

### Fluxo Corrigido

```text
Resposta do Gemini
        |
        v
  Tem functionCall? ----Sim----> Executar funcao
        |                              |
       Nao                             v
        |                    Adicionar resultado
        v                              |
  Obter texto                          v
        |                    Continuar loop
        v
  Texto contem codigo? ----Sim----> Extrair funcao
        |                              |
       Nao                         Extraiu?
        |                           /    \
        v                         Sim    Nao
  Enviar ao cliente                |      |
                                   v      v
                            Executar   Pedir nova
                            funcao     resposta
                                   |
                                   v
                            Continuar loop
```

---

### Resultado Esperado

Apos a correcao, o fluxo sera:

```text
Cliente: "isso" (confirmando reuniao amanha 16h)
         |
         v
IA: [Detecta intencao de criar agendamento]
    [Usa tool create_appointment]
         |
         v
manage-appointment: [Cria registro no banco]
         |
         v
IA: "Perfeito, Thays! Sua reuniao com o Wemerson 
     foi agendada para amanha, 27/01, as 16:00. 
     Posso ajudar com mais alguma coisa?"
```

---

### Arquivos a Modificar

| Arquivo | Alteracoes |
|---------|------------|
| `supabase/functions/whatsapp-ai-agent/index.ts` | Adicionar funcoes de deteccao/extracao, modificar loop de processamento, melhorar system prompt |

---

### Verificacao Adicional

O sistema ja esta configurado corretamente para:
- Tabela `appointments` existe com RLS
- Tabela `appointment_slots` tem horarios configurados (seg-sex 08:00-18:00)
- Edge function `manage-appointment` suporta todas as operacoes necessarias
- Conexao entre `whatsapp-ai-agent` e `manage-appointment` esta correta

O unico problema e a filtragem/tratamento da resposta do Gemini quando ele gera codigo ao inves de usar function calling.

