import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Detecta se a resposta contém código de function call ao invés de texto natural
function containsFunctionCallCode(text: string): boolean {
  const codePatterns = [
    /print\s*\(/i,
    /default_api\./i,
    /check_available_slots\s*\(/i,
    /create_appointment\s*\(/i,
    /cancel_appointment\s*\(/i,
    /list_appointments\s*\(/i,
    /confirm_appointment\s*\(/i,
    /update_appointment_tags\s*\(/i,
    /\w+_api\.\w+\s*\(/i,
    /```[\s\S]*```/,
  ];
  return codePatterns.some(pattern => pattern.test(text));
}

// Tenta extrair uma chamada de função do texto com código
function extractFunctionCallFromText(text: string): { name: string; args: Record<string, string> } | null {
  const pattern = /(check_available_slots|create_appointment|cancel_appointment|list_appointments|confirm_appointment|update_appointment_tags)\s*\(\s*([^)]*)\)/i;
  
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
  return null;
}

// Tool definitions for function calling
const schedulingTools = {
  function_declarations: [
    {
      name: "check_available_slots",
      description: "Verifica horários disponíveis para agendamento em uma data específica. Use quando o cliente perguntar sobre disponibilidade ou quiser agendar.",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "Data para verificar disponibilidade no formato YYYY-MM-DD"
          }
        },
        required: ["date"]
      }
    },
    {
      name: "create_appointment",
      description: "Cria um novo agendamento após confirmar data, horário e serviço com o cliente.",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "Data do agendamento no formato YYYY-MM-DD"
          },
          time: {
            type: "string",
            description: "Horário do agendamento no formato HH:MM"
          },
          title: {
            type: "string",
            description: "Tipo de serviço ou título do agendamento"
          },
          description: {
            type: "string",
            description: "Detalhes adicionais ou observações"
          }
        },
        required: ["date", "time", "title"]
      }
    },
    {
      name: "cancel_appointment",
      description: "Cancela um agendamento existente do cliente.",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "Data do agendamento a cancelar no formato YYYY-MM-DD"
          },
          time: {
            type: "string",
            description: "Horário do agendamento a cancelar no formato HH:MM"
          }
        },
        required: ["date", "time"]
      }
    },
    {
      name: "list_appointments",
      description: "Lista os agendamentos do cliente.",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "Data opcional para filtrar agendamentos no formato YYYY-MM-DD"
          }
        },
        required: []
      }
    },
    {
      name: "confirm_appointment",
      description: "Confirma a presença do cliente em um agendamento. Use quando o cliente disser que confirma, que vai comparecer, responder SIM a um lembrete, etc.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    },
    {
      name: "update_appointment_tags",
      description: "Adiciona ou remove tags de um agendamento (ex: realizado, no-show, reagendado).",
      parameters: {
        type: "object",
        properties: {
          appointmentId: {
            type: "string",
            description: "ID do agendamento"
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Tags para adicionar ou remover"
          },
          action: {
            type: "string",
            description: "Ação: 'add' para adicionar ou 'remove' para remover tags"
          }
        },
        required: ["tags"]
      }
    }
  ]
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

    const { userId, phone, messageContent, contactName } = await req.json();

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

    // Get today's date for context
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const todayFormatted = today.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

    // Build system prompt with scheduling capabilities
    const systemPrompt = `Você é ${aiConfig.agent_name || "um assistente virtual"} de atendimento via WhatsApp.

${aiConfig.custom_prompt || "Seja cordial, profissional e prestativo."}

${knowledgeBase ? `Use a seguinte base de conhecimento para responder:\n\n${knowledgeBase.slice(0, 6000)}` : ""}

IMPORTANTE - AGENDAMENTOS:
Você tem acesso a ferramentas para gerenciar agendamentos. Quando o cliente:
- Perguntar sobre disponibilidade ou horários: Use check_available_slots
- Quiser marcar/agendar algo: Primeiro verifique disponibilidade, depois use create_appointment
- Quiser cancelar um agendamento: Use cancel_appointment
- Quiser ver seus agendamentos: Use list_appointments
- Confirmar presença (responder "sim", "confirmo", "confirmado", "vou sim", etc.): Use confirm_appointment
- O sistema envia lembretes automáticos. Quando o cliente responder confirmando, use confirm_appointment imediatamente.

Hoje é ${todayFormatted} (${todayStr}).
Ao mencionar datas, converta para o formato YYYY-MM-DD para as funções.
Exemplos: "amanhã" = dia seguinte, "segunda" = próxima segunda-feira.

REGRAS CRÍTICAS - NUNCA VIOLE:
- NUNCA escreva código Python, JavaScript ou qualquer linguagem de programação
- NUNCA use print(), default_api, ou sintaxe de função no texto
- NUNCA envie comandos técnicos para o cliente
- Use APENAS as ferramentas (tools) disponibilizadas pelo sistema através de function calling
- Responda SEMPRE em linguagem natural e conversacional
- Quando precisar verificar disponibilidade ou criar agendamento, use as tools, NÃO escreva código

Regras adicionais:
- Responda de forma natural e conversacional
- Seja objetivo e direto
- Use emojis com moderação
- Se não souber a resposta, diga que vai verificar com a equipe
- Nunca invente informações
- Responda sempre em português brasileiro
- Ao agendar, sempre confirme data, horário e serviço antes de finalizar`;

    // Build conversation messages
    const conversationMessages = recentMessages.map((msg: any) => ({
      role: msg.from_me ? "model" : "user",
      parts: [{ text: msg.content }],
    }));

    // Add current message
    conversationMessages.push({ role: "user", parts: [{ text: messageContent }] });

    // Call Gemini with function calling
    const geminiPayload = {
      contents: [
        { role: "user", parts: [{ text: systemPrompt }] },
        { role: "model", parts: [{ text: "Entendido. Vou seguir essas instruções e usar as ferramentas de agendamento quando necessário." }] },
        ...conversationMessages,
      ],
      tools: [schedulingTools],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1024,
      },
    };

    let aiReply = "";
    let functionCallsProcessed = 0;
    const maxFunctionCalls = 3;

    while (functionCallsProcessed < maxFunctionCalls) {
      const aiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(geminiPayload),
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
      const candidate = aiData.candidates?.[0];
      const content = candidate?.content;

      if (!content?.parts) {
        console.error("Empty AI response");
        break;
      }

      // Check for function calls
      const functionCall = content.parts.find((p: any) => p.functionCall);
      
      if (functionCall) {
        const fc = functionCall.functionCall;
        console.log("Function call:", fc.name, fc.args);
        
        // Execute the function
        const functionResult = await executeFunction(supabase, supabaseUrl, fc.name, {
          ...fc.args,
          userId,
          phone,
          contactName,
        });

        console.log("Function result:", functionResult);

        // Add function call and result to context
        geminiPayload.contents.push(content);
        geminiPayload.contents.push({
          role: "user",
          parts: [{
            functionResponse: {
              name: fc.name,
              response: functionResult,
            }
          }]
        });

        functionCallsProcessed++;
        continue;
      }

      // No function call, get text response
      const textPart = content.parts.find((p: any) => p.text);
      if (textPart) {
        const responseText = textPart.text;
        
        // Detectar se a resposta contém código de function call
        if (containsFunctionCallCode(responseText)) {
          console.log("Detected code in response, attempting to extract function call");
          
          const extracted = extractFunctionCallFromText(responseText);
          
          if (extracted) {
            // Executar a função extraída
            console.log("Extracted function:", extracted.name, extracted.args);
            
            const functionResult = await executeFunction(supabase, supabaseUrl, extracted.name, {
              ...extracted.args,
              userId,
              phone,
              contactName,
            });

            console.log("Extracted function result:", functionResult);

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
            // Não conseguiu extrair, pedir nova resposta
            console.log("Could not extract function, requesting natural language response");
            geminiPayload.contents.push({
              role: "user",
              parts: [{ 
                text: "Responda APENAS em linguagem natural para o cliente. NÃO use código, funções print(), ou sintaxe de programação. Use as ferramentas disponibilizadas pelo sistema." 
              }]
            });
            functionCallsProcessed++;
            continue;
          }
        }
        
        // Resposta normal, usar
        aiReply = responseText;
      }
      break;
    }

    if (!aiReply) {
      console.error("No AI reply generated");
      return new Response(JSON.stringify({ error: "No AI response" }), { 
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

async function executeFunction(supabase: any, supabaseUrl: string, name: string, args: any): Promise<any> {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/manage-appointment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({
        operation: name === "check_available_slots" ? "check_availability" : name,
        userId: args.userId,
        phone: args.phone,
        contactName: args.contactName,
        date: args.date,
        time: args.time,
        title: args.title,
        description: args.description,
      }),
    });

    const result = await response.json();
    return result;
  } catch (error) {
    console.error("Function execution error:", error);
    return { error: "Erro ao executar função", message: error instanceof Error ? error.message : "Unknown error" };
  }
}

function splitMessage(text: string): string[] {
  if (text.length < 200) return [text];
  
  const parts = text.split(/\n\n+/).filter(p => p.trim());
  if (parts.length > 1) return parts.slice(0, 3);
  
  return [text];
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendWhatsAppMessage(supabase: any, userId: string, phone: string, message: string) {
  try {
    const evolutionUrl = Deno.env.get("EVOLUTION_API_URL")?.replace(/\/$/, "");
    const evolutionKey = Deno.env.get("EVOLUTION_API_KEY");

    if (!evolutionUrl || !evolutionKey) {
      console.error("Evolution API not configured in secrets");
      return;
    }

    const { data: instance } = await supabase
      .from("whatsapp_instances")
      .select("instance_name")
      .eq("user_id", userId)
      .maybeSingle();

    if (!instance) {
      console.error("Instance not found");
      return;
    }

    const response = await fetch(`${evolutionUrl}/message/sendText/${instance.instance_name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: evolutionKey,
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
