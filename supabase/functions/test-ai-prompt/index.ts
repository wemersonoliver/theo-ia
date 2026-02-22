import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const geminiApiKey = Deno.env.get("GOOGLE_GEMINI_API_KEY")!;

    if (!geminiApiKey) {
      return new Response(JSON.stringify({ error: "GOOGLE_GEMINI_API_KEY não configurada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = authData.user.id;
    const { messages, userMessage } = await req.json();

    // Get AI config (same as whatsapp-ai-agent)
    const { data: aiConfig } = await supabase
      .from("whatsapp_ai_config")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    // Get knowledge base
    const { data: documents } = await supabase
      .from("knowledge_base_documents")
      .select("content_text")
      .eq("user_id", userId)
      .eq("status", "ready");

    const knowledgeBase = documents?.map((d) => d.content_text).filter(Boolean).join("\n\n---\n\n") || "";

    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const todayFormatted = today.toLocaleDateString("pt-BR", {
      weekday: "long", day: "2-digit", month: "long", year: "numeric",
    });

    // Build the SAME system prompt as whatsapp-ai-agent
    const systemPrompt = `Você é ${aiConfig?.agent_name || "um assistente virtual"} de atendimento via WhatsApp.

${aiConfig?.custom_prompt || "Seja cordial, profissional e prestativo."}

${knowledgeBase ? `Use a seguinte base de conhecimento para responder:\n\n${knowledgeBase.slice(0, 6000)}` : ""}

IMPORTANTE - AGENDAMENTOS:
Você tem acesso a ferramentas para gerenciar agendamentos. Quando o cliente:
- Perguntar sobre disponibilidade ou horários: Use check_available_slots
- Quiser marcar/agendar algo: Primeiro verifique disponibilidade, depois use create_appointment
- Quiser cancelar um agendamento: Use cancel_appointment
- Quiser ver seus agendamentos: Use list_appointments
- Confirmar presença: Use confirm_appointment

Hoje é ${todayFormatted} (${todayStr}).

REGRAS CRÍTICAS:
- NUNCA escreva código Python, JavaScript ou qualquer linguagem de programação
- Responda SEMPRE em linguagem natural e conversacional

Regras adicionais:
- Responda de forma natural e conversacional
- Seja objetivo e direto
- Use emojis com moderação
- Se não souber a resposta, diga que vai verificar com a equipe
- Nunca invente informações
- Responda sempre em português brasileiro
- FORMATAÇÃO HUMANIZADA: Separe sua resposta em parágrafos curtos (2-3 frases cada). Use quebras de linha duplas entre os parágrafos.

CONTEXTO: Esta é uma SIMULAÇÃO DE TESTE. Responda como se fosse um atendimento real via WhatsApp. O usuário está testando a qualidade das respostas.`;

    // Build conversation for Gemini
    const geminiContents: any[] = [
      { role: "user", parts: [{ text: systemPrompt }] },
      { role: "model", parts: [{ text: "Entendido. Vou seguir essas instruções." }] },
    ];

    // Add history
    for (const msg of (messages || [])) {
      geminiContents.push({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      });
    }

    // Add new user message
    if (userMessage) {
      geminiContents.push({ role: "user", parts: [{ text: userMessage }] });
    }

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: geminiContents,
          generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error("Gemini error:", errText);
      throw new Error(`Gemini API error: ${geminiRes.status}`);
    }

    const geminiData = await geminiRes.json();
    const aiReply = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";

    return new Response(JSON.stringify({ message: aiReply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("test-ai-prompt error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
