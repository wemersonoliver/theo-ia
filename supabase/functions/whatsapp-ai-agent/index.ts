import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const geminiApiKey = Deno.env.get("GOOGLE_GEMINI_API_KEY")!;

    if (!geminiApiKey) {
      return new Response(JSON.stringify({ error: "GOOGLE_GEMINI_API_KEY not configured" }), { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { userId, phone, messageContent } = await req.json();

    if (!userId || !phone) {
      return new Response(JSON.stringify({ error: "Missing parameters" }), { 
        status: 400, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // Get AI config
    const { data: aiConfig } = await supabase
      .from("whatsapp_ai_config")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (!aiConfig?.active) {
      console.log("AI not active for user:", userId);
      return new Response(JSON.stringify({ skipped: true, reason: "AI not active" }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // Check business hours
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentDay = now.getDay();
    const currentTime = currentHour * 60 + currentMinute;

    const [startHour, startMin] = (aiConfig.business_hours_start || "08:00").split(":").map(Number);
    const [endHour, endMin] = (aiConfig.business_hours_end || "18:00").split(":").map(Number);
    const startTime = startHour * 60 + startMin;
    const endTime = endHour * 60 + endMin;

    const businessDays = aiConfig.business_days || [1, 2, 3, 4, 5];

    if (!businessDays.includes(currentDay) || currentTime < startTime || currentTime > endTime) {
      // Outside business hours
      if (aiConfig.out_of_hours_message) {
        await sendWhatsAppMessage(supabase, userId, phone, aiConfig.out_of_hours_message);
        await saveAIMessage(supabase, userId, phone, aiConfig.out_of_hours_message, "ai");
      }
      return new Response(JSON.stringify({ skipped: true, reason: "Outside business hours" }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // Get or create AI session
    const { data: session } = await supabase
      .from("whatsapp_ai_sessions")
      .select("*")
      .eq("user_id", userId)
      .eq("phone", phone)
      .maybeSingle();

    if (session?.status === "handed_off") {
      console.log("Conversation handed off, skipping AI");
      return new Response(JSON.stringify({ skipped: true, reason: "Handed off" }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // Check message limit
    const messagesCount = session?.messages_without_human || 0;
    if (messagesCount >= (aiConfig.max_messages_without_human || 10)) {
      if (aiConfig.handoff_message) {
        await sendWhatsAppMessage(supabase, userId, phone, aiConfig.handoff_message);
        await saveAIMessage(supabase, userId, phone, aiConfig.handoff_message, "ai");
      }
      
      await supabase
        .from("whatsapp_ai_sessions")
        .upsert({
          user_id: userId,
          phone,
          status: "handed_off",
          handed_off_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id,phone" });

      return new Response(JSON.stringify({ skipped: true, reason: "Message limit reached" }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // Get conversation history for context
    const { data: conversation } = await supabase
      .from("whatsapp_conversations")
      .select("messages")
      .eq("user_id", userId)
      .eq("phone", phone)
      .maybeSingle();

    const recentMessages = (conversation?.messages || []).slice(-10);

    // Get knowledge base documents
    const { data: documents } = await supabase
      .from("knowledge_base_documents")
      .select("content_text")
      .eq("user_id", userId)
      .eq("status", "ready");

    const knowledgeBase = documents?.map(d => d.content_text).filter(Boolean).join("\n\n---\n\n") || "";

    // Build system prompt
    const systemPrompt = `Você é ${aiConfig.agent_name || "um assistente virtual"} de atendimento via WhatsApp.

${aiConfig.custom_prompt || "Seja cordial, profissional e prestativo."}

${knowledgeBase ? `Use a seguinte base de conhecimento para responder:\n\n${knowledgeBase.slice(0, 8000)}` : ""}

Regras importantes:
- Responda de forma natural e conversacional, como se fosse um atendente humano
- Seja objetivo e direto, evite respostas muito longas
- Use emojis com moderação
- Se não souber a resposta, diga que vai verificar com a equipe
- Nunca invente informações que não estejam na base de conhecimento
- Responda sempre em português brasileiro`;

    // Build conversation messages
    const conversationMessages = recentMessages.map((msg: any) => ({
      role: msg.from_me ? "assistant" : "user",
      content: msg.content,
    }));

    // Add current message if not already in history
    if (!conversationMessages.length || conversationMessages[conversationMessages.length - 1].content !== messageContent) {
      conversationMessages.push({ role: "user", content: messageContent });
    }

    // Call Google Gemini API directly
    const geminiMessages = [
      { role: "user", parts: [{ text: systemPrompt }] },
      { role: "model", parts: [{ text: "Entendido. Vou seguir essas instruções." }] },
      ...conversationMessages.map((msg: any) => ({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      })),
    ];

    const aiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: geminiMessages,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1024,
          },
        }),
      }
    );

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        console.error("AI rate limit exceeded");
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { 
          status: 429, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }
      const errorText = await aiResponse.text();
      console.error("AI error:", errorText);
      return new Response(JSON.stringify({ error: "AI error" }), { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    const aiData = await aiResponse.json();
    const aiReply = aiData.candidates?.[0]?.content?.parts?.[0]?.text || "";

    if (!aiReply) {
      console.error("Empty AI response");
      return new Response(JSON.stringify({ error: "Empty AI response" }), { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // Split response into parts for more human-like delivery
    const parts = splitMessage(aiReply);

    // Send each part with delay
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) {
        await delay(1500 + Math.random() * 1000);
      }
      await sendWhatsAppMessage(supabase, userId, phone, parts[i]);
    }

    // Save full response to conversation
    await saveAIMessage(supabase, userId, phone, aiReply, "ai");

    // Update session
    await supabase
      .from("whatsapp_ai_sessions")
      .upsert({
        user_id: userId,
        phone,
        status: "active",
        messages_without_human: messagesCount + 1,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,phone" });

    console.log("AI response sent to:", phone);

    return new Response(JSON.stringify({ success: true, response: aiReply }), { 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });

  } catch (error) {
    console.error("AI Agent error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { 
      status: 500, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
});

function splitMessage(text: string): string[] {
  // Split on double newlines or if text is very long
  if (text.length < 200) return [text];
  
  const parts = text.split(/\n\n+/).filter(p => p.trim());
  if (parts.length > 1) return parts.slice(0, 3); // Max 3 parts
  
  // If no natural breaks, return as-is
  return [text];
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendWhatsAppMessage(supabase: any, userId: string, phone: string, message: string) {
  try {
    // Get instance and settings
    const { data: instance } = await supabase
      .from("whatsapp_instances")
      .select("instance_name")
      .eq("user_id", userId)
      .maybeSingle();

    const { data: settings } = await supabase
      .from("platform_settings")
      .select("evolution_api_url, evolution_api_key")
      .eq("user_id", userId)
      .maybeSingle();

    if (!instance || !settings?.evolution_api_url) {
      console.error("Instance or settings not found");
      return;
    }

    const evolutionUrl = settings.evolution_api_url.replace(/\/$/, "");

    const response = await fetch(`${evolutionUrl}/message/sendText/${instance.instance_name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: settings.evolution_api_key,
      },
      body: JSON.stringify({
        number: phone,
        text: message,
      }),
    });

    const responseText = await response.text();
    if (!response.ok) {
      console.error("Evolution send error:", responseText);
    }
  } catch (error) {
    console.error("Send message error:", error);
  }
}

async function saveAIMessage(supabase: any, userId: string, phone: string, content: string, sentBy: string) {
  const { data: conversation } = await supabase
    .from("whatsapp_conversations")
    .select("id, messages")
    .eq("user_id", userId)
    .eq("phone", phone)
    .maybeSingle();

  const newMessage = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    from_me: true,
    content,
    type: "text",
    sent_by: sentBy,
  };

  if (conversation) {
    const existingMessages = conversation.messages || [];
    const updatedMessages = [...existingMessages, newMessage];

    await supabase
      .from("whatsapp_conversations")
      .update({
        messages: updatedMessages,
        last_message_at: new Date().toISOString(),
        total_messages: updatedMessages.length,
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversation.id);
  }
}
