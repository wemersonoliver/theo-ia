import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GEMINI_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");
const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

const SYSTEM_PROMPT = `Você é um especialista em atendimento digital e automação de WhatsApp com IA. Sua missão é conduzir uma entrevista consultiva para criar o prompt de atendimento ideal para a empresa informada.

PASSO 1 — IDENTIFICAÇÃO DA INTENÇÃO (OBRIGATÓRIO):
A PRIMEIRA pergunta da entrevista SEMPRE deve ser sobre a intenção principal de uso da IA. Apresente as opções de forma clara e amigável, por exemplo:
"Antes de começarmos, me conta: qual será o foco principal do atendimento via WhatsApp? 
1️⃣ Vendas ativas — a IA deve engajar, contornar objeções e fechar negócios
2️⃣ Pré-atendimento e informações — a IA responde dúvidas, apresenta produtos/serviços e encaminha para agendamento ou atendimento humano
3️⃣ Agendamentos — o foco é marcar consultas, reuniões ou visitas
4️⃣ Suporte e pós-venda — tirar dúvidas de clientes que já compraram
Pode escolher uma ou combinar mais de uma!"

PASSO 2 — ADAPTE O CAMINHO DA ENTREVISTA CONFORME A INTENÇÃO:

SE o foco for VENDAS ATIVAS:
- Pergunte sobre ciclo de vendas, objeções mais comuns, diferenciais competitivos, gatilhos de urgência/escassez, política de preços/desconto, script de fechamento.

SE o foco for PRÉ-ATENDIMENTO / INFORMAÇÕES / AGENDAMENTO:
- NÃO conduza a entrevista com viés de vendas.
- Pergunte sobre: quais dúvidas os clientes mais fazem, quais informações precisam ser repassadas (horários, endereço, serviços, etc.), como funciona o processo de agendamento, o que a IA deve fazer quando o cliente quer falar com uma pessoa.
- O tom do prompt gerado deve ser ACOLHEDOR, INFORMATIVO e EFICIENTE — não persuasivo.

SE o foco for SUPORTE / PÓS-VENDA:
- Pergunte sobre problemas comuns pós-compra, políticas de troca/garantia, canais de escalada, tom para situações de insatisfação.

REGRAS ABSOLUTAS (para todos os caminhos):
1. Faça EXATAMENTE UMA pergunta por vez, de forma conversacional e amigável
2. Adapte cada pergunta com base nas respostas anteriores — seja contextual
3. Use seu conhecimento sobre dores e dúvidas frequentes do segmento informado
4. Após 5 a 8 perguntas (quando julgar que tem informações suficientes), encerre a entrevista
5. AO ENCERRAR: escreva exatamente a tag [FINISH] em uma linha separada, seguida IMEDIATAMENTE pelo PROMPT MESTRE COMPLETO

ESTRUTURA OBRIGATÓRIA DO PROMPT MESTRE (após [FINISH]):
---
## PERSONA
[Nome do agente, tom de voz, personalidade alinhada à intenção identificada — acolhedor/informativo para pré-atendimento, persuasivo para vendas]

## CONHECIMENTO DO NEGÓCIO
[Empresa, segmento, produtos/serviços, diferenciais, preços se informados, políticas, horários, endereço se relevante]

## PROTOCOLO DE ATENDIMENTO
[Fluxo de atendimento adaptado à intenção: para pré-atendimento → como responder dúvidas, repassar informações e encaminhar para agendamento/humano; para vendas → como engajar e fechar]

## OBJETIVO PRINCIPAL
[O que a IA deve alcançar em cada conversa conforme a intenção identificada]

## REGRAS CRÍTICAS
[O que nunca fazer, limites do atendimento, quando escalar para humano — adaptado ao contexto]
---

IMPORTANTE: O prompt gerado deve refletir FIELMENTE a intenção de uso informada pelo usuário. Se for pré-atendimento, o prompt NÃO deve ter linguagem de vendas agressiva.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: authData, error: authError } = await supabase.auth.getClaims(token);
    if (authError || !authData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = authData.claims.sub;

    const { interviewId, companyName, segment, messages, userMessage } = await req.json();

    if (!GEMINI_API_KEY) {
      throw new Error("GOOGLE_GEMINI_API_KEY não configurada");
    }

    // Monta o histórico de conversa para o Gemini
    const contextIntro = `Empresa: "${companyName}" | Segmento: "${segment}"`;
    
    const geminiContents = [];
    
    // Primeira mensagem do sistema como user turn (Gemini não aceita system role direto em contents)
    geminiContents.push({
      role: "user",
      parts: [{ text: `${contextIntro}\n\nInicie a entrevista consultiva.` }],
    });

    // Adiciona histórico existente
    for (const msg of messages) {
      geminiContents.push({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      });
    }

    // Adiciona a nova mensagem do usuário (se não for o início)
    if (userMessage && messages.length > 0) {
      geminiContents.push({
        role: "user",
        parts: [{ text: userMessage }],
      });
    }

    const geminiBody = {
      system_instruction: {
        parts: [{ text: SYSTEM_PROMPT }],
      },
      contents: geminiContents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4096,
      },
    };

    const geminiRes = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiBody),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error("Gemini error:", errText);
      throw new Error(`Gemini API error: ${geminiRes.status}`);
    }

    const geminiData = await geminiRes.json();
    const aiResponse =
      geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // Detecta se a entrevista terminou
    const hasFinished = aiResponse.includes("[FINISH]");
    let generatedPrompt: string | null = null;
    let displayMessage = aiResponse;

    if (hasFinished) {
      const parts = aiResponse.split("[FINISH]");
      displayMessage = parts[0].trim() || "Entrevista concluída! O prompt foi gerado com sucesso.";
      generatedPrompt = parts[1]?.trim() || "";
    }

    // Atualiza o histórico no banco
    if (interviewId) {
      const newMessages = [...messages];
      if (userMessage && messages.length > 0) {
        newMessages.push({ role: "user", content: userMessage });
      }
      newMessages.push({ role: "assistant", content: displayMessage });

      const updateData: Record<string, unknown> = { messages: newMessages };
      if (hasFinished) {
        updateData.status = "completed";
        updateData.generated_prompt = generatedPrompt;
      }

      await supabase
        .from("entrevistas_config")
        .update(updateData)
        .eq("id", interviewId)
        .eq("user_id", userId);
    }

    return new Response(
      JSON.stringify({
        message: displayMessage,
        finished: hasFinished,
        generatedPrompt,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("interview-ai-agent error:", err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Erro interno",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
