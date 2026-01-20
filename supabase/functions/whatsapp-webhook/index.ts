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
    // This is a public webhook - no auth required
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    console.log("Webhook received:", JSON.stringify(body).slice(0, 500));

    const { event, instance, data } = body;
    const instanceName = instance || body.instanceName;

    if (!instanceName) {
      return new Response(JSON.stringify({ error: "No instance name" }), { 
        status: 400, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // Find the instance owner
    const { data: instanceData } = await supabase
      .from("whatsapp_instances")
      .select("user_id, id")
      .eq("instance_name", instanceName)
      .maybeSingle();

    if (!instanceData) {
      console.log("Instance not found:", instanceName);
      return new Response(JSON.stringify({ ok: true }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    const userId = instanceData.user_id;

    // Handle different events
    if (event === "qrcode.updated" || event === "QRCODE_UPDATED") {
      const qrCode = data?.qrcode?.base64 || data?.base64;
      
      await supabase
        .from("whatsapp_instances")
        .update({
          status: "qr_ready",
          qr_code_base64: qrCode,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);

      console.log("QR Code updated for user:", userId);
    }

    if (event === "connection.update" || event === "CONNECTION_UPDATE") {
      const state = data?.state || data?.status;
      
      if (state === "open" || state === "connected") {
        // Get phone info
        const phoneNumber = data?.pushName ? null : data?.wid?.split("@")[0];
        const profileName = data?.pushName || null;

        await supabase
          .from("whatsapp_instances")
          .update({
            status: "connected",
            qr_code_base64: null,
            phone_number: phoneNumber,
            profile_name: profileName,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId);

        console.log("WhatsApp connected for user:", userId);
      } else if (state === "close" || state === "disconnected") {
        await supabase
          .from("whatsapp_instances")
          .update({
            status: "disconnected",
            qr_code_base64: null,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId);

        console.log("WhatsApp disconnected for user:", userId);
      }
    }

    if (event === "messages.upsert" || event === "MESSAGES_UPSERT") {
      const messages = data?.messages || [data];
      
      for (const msg of messages) {
        if (!msg || msg.key?.fromMe) continue; // Skip outgoing messages
        
        const remoteJid = msg.key?.remoteJid;
        if (!remoteJid || remoteJid.includes("@g.us")) continue; // Skip groups

        const phone = remoteJid.replace("@s.whatsapp.net", "");
        const content = msg.message?.conversation || 
                       msg.message?.extendedTextMessage?.text ||
                       msg.message?.imageMessage?.caption ||
                       "[Mídia]";
        
        const contactName = msg.pushName || null;

        // Get or create conversation
        const { data: conversation } = await supabase
          .from("whatsapp_conversations")
          .select("id, messages, ai_active")
          .eq("user_id", userId)
          .eq("phone", phone)
          .maybeSingle();

        const newMessage = {
          id: msg.key?.id || crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          from_me: false,
          content,
          type: "text",
          sent_by: "human",
        };

        if (conversation) {
          const existingMessages = conversation.messages || [];
          const updatedMessages = [...existingMessages, newMessage];

          await supabase
            .from("whatsapp_conversations")
            .update({
              messages: updatedMessages,
              contact_name: contactName || undefined,
              last_message_at: new Date().toISOString(),
              total_messages: updatedMessages.length,
              updated_at: new Date().toISOString(),
            })
            .eq("id", conversation.id);

          // Trigger AI response if active
          if (conversation.ai_active) {
            await triggerAIResponse(supabase, userId, phone, content);
          }
        } else {
          await supabase
            .from("whatsapp_conversations")
            .insert({
              user_id: userId,
              phone,
              contact_name: contactName,
              messages: [newMessage],
              last_message_at: new Date().toISOString(),
              total_messages: 1,
              ai_active: true,
            });

          // Trigger AI for new conversation
          await triggerAIResponse(supabase, userId, phone, content);
        }

        console.log("Message saved:", phone, content.slice(0, 50));
      }
    }

    return new Response(JSON.stringify({ ok: true }), { 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });

  } catch (error) {
    console.error("Webhook error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { 
      status: 500, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
});

async function triggerAIResponse(supabase: any, userId: string, phone: string, messageContent: string) {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    
    // Call the AI agent function
    await fetch(`${supabaseUrl}/functions/v1/whatsapp-ai-agent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({ userId, phone, messageContent }),
    });
  } catch (error) {
    console.error("Error triggering AI:", error);
  }
}
