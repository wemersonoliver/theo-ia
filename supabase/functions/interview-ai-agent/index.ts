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

const SYSTEM_PROMPT = `Você é um especialista em atendimento digital e automação de WhatsApp com IA. Sua missão é conduzir uma entrevista consultiva para criar o melhor prompt de atendimento do mundo para a empresa informada.

REGRAS ABSOLUTAS:
1. Faça EXATAMENTE UMA pergunta por vez, de forma conversacional e amigável
2. Analise profundamente o segmento informado e use seu conhecimento sobre:
   - Dores e objeções mais comuns dos clientes desse nicho
   - Dúvidas frequentes específicas do setor
   - Gargalos de atendimento típicos do segmento
   - Fluxos de compra/contratação usuais do mercado
3. Adapte cada pergunta com base nas respostas anteriores — seja contextual
4. Após 5 a 8 perguntas (quando julgar que tem informações suficientes para criar um prompt robusto), encerre a entrevista
5. AO ENCERRAR: escreva exatamente a tag [FINISH] em uma linha separada, seguida IMEDIATAMENTE pelo PROMPT MESTRE COMPLETO

ESTRUTURA OBRIGATÓRIA DO PROMPT MESTRE (após [FINISH]):
---
## PERSONA
[Nome do agente, tom de voz, personalidade, idioma]

## CONHECIMENTO DO NEGÓCIO
[Empresa, segmento, produtos/serviços, diferenciais, preços se informados, políticas]

## PROTOCOLO DE ATENDIMENTO
[Como cumprimentar, fluxo de atendimento, como lidar com objeções específicas do setor, dúvidas frequentes mapeadas e suas respostas]

## CALL TO ACTION
[Objetivo principal de cada conversa: agendar, vender, gerar lead, etc.]

## REGRAS CRÍTICAS
[O que nunca fazer, limites do atendimento, quando escalar para humano, tom a evitar]
---

IMPORTANTE: O prompt gerado deve ser extremamente detalhado, prático e pronto para uso imediato no WhatsApp.`;

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
