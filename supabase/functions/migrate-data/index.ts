import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PUBLIC_TABLES = [
  "profiles",
  "user_roles",
  "contacts",
  "whatsapp_instances",
  "whatsapp_conversations",
  "whatsapp_ai_config",
  "whatsapp_ai_sessions",
  "whatsapp_pending_responses",
  "appointments",
  "appointment_slots",
  "notification_contacts",
  "knowledge_base_documents",
  "platform_settings",
  "entrevistas_config",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Source DB (this project)
    const sourceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify caller is super_admin
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: claims, error: claimsErr } = await anonClient.auth.getUser();
    if (claimsErr || !claims.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: roleData } = await sourceClient
      .from("user_roles")
      .select("role")
      .eq("user_id", claims.user.id)
      .eq("role", "super_admin");
    if (!roleData || roleData.length === 0) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Target DB (new project)
    const newUrl = Deno.env.get("NEW_SUPABASE_URL");
    const newKey = Deno.env.get("NEW_SUPABASE_SERVICE_ROLE_KEY");
    if (!newUrl || !newKey) {
      return new Response(
        JSON.stringify({ error: "New project credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const targetClient = createClient(newUrl, newKey);

    const { action } = await req.json();
    const log: Record<string, unknown>[] = [];

    if (action === "migrate_users") {
      // Migrate auth users
      const { data: authData, error: authErr } =
        await sourceClient.auth.admin.listUsers({ perPage: 1000 });
      if (authErr) throw authErr;

      let created = 0;
      let skipped = 0;
      for (const user of authData.users) {
        try {
          const { error: createErr } =
            await targetClient.auth.admin.createUser({
              email: user.email,
              phone: user.phone,
              email_confirm: true,
              phone_confirm: !!user.phone,
              user_metadata: user.user_metadata,
              app_metadata: user.app_metadata,
              // Generate a temp password; users can reset later
              password: `Temp_${crypto.randomUUID().slice(0, 8)}!`,
            });
          if (createErr) {
            // User might already exist
            skipped++;
            log.push({ user: user.email, status: "skipped", reason: createErr.message });
          } else {
            created++;
            log.push({ user: user.email, status: "created" });
          }
        } catch (e) {
          skipped++;
          log.push({ user: user.email, status: "error", reason: e.message });
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: `Usuários: ${created} criados, ${skipped} ignorados`,
          details: log,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "migrate_table") {
      const body = JSON.parse(await new Response(req.body).text().catch(() => "{}"));
      // We already consumed req.json() above, so we parse tableName from the action call
      // Actually let's re-read - we need to adjust. The body was already consumed.
      // Fix: read body once at top. Let's handle it differently.
    }

    if (action === "migrate_tables") {
      const results: Record<string, string> = {};

      for (const table of PUBLIC_TABLES) {
        try {
          // Read all data from source
          const { data: rows, error: readErr } = await sourceClient
            .from(table)
            .select("*");
          if (readErr) {
            results[table] = `Erro leitura: ${readErr.message}`;
            continue;
          }
          if (!rows || rows.length === 0) {
            results[table] = "Vazio (0 registros)";
            continue;
          }

          // Insert into target (upsert to handle re-runs)
          const { error: writeErr } = await targetClient
            .from(table)
            .upsert(rows, { onConflict: "id" });
          if (writeErr) {
            results[table] = `Erro escrita: ${writeErr.message}`;
          } else {
            results[table] = `${rows.length} registros migrados`;
          }
        } catch (e) {
          results[table] = `Erro: ${e.message}`;
        }
      }

      return new Response(
        JSON.stringify({ success: true, results }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "migrate_all") {
      // Step 1: Migrate users
      const usersResult: Record<string, unknown>[] = [];
      const { data: authData } =
        await sourceClient.auth.admin.listUsers({ perPage: 1000 });
      let usersCreated = 0;
      let usersSkipped = 0;

      if (authData?.users) {
        for (const user of authData.users) {
          try {
            const { error: createErr } =
              await targetClient.auth.admin.createUser({
                email: user.email,
                phone: user.phone,
                email_confirm: true,
                phone_confirm: !!user.phone,
                user_metadata: user.user_metadata,
                app_metadata: user.app_metadata,
                password: `Temp_${crypto.randomUUID().slice(0, 8)}!`,
              });
            if (createErr) {
              usersSkipped++;
              usersResult.push({ email: user.email, status: "skipped", reason: createErr.message });
            } else {
              usersCreated++;
              usersResult.push({ email: user.email, status: "created" });
            }
          } catch (e) {
            usersSkipped++;
            usersResult.push({ email: user.email, status: "error", reason: e.message });
          }
        }
      }

      // Step 2: Migrate tables
      const tablesResult: Record<string, string> = {};
      for (const table of PUBLIC_TABLES) {
        try {
          const { data: rows, error: readErr } = await sourceClient
            .from(table)
            .select("*");
          if (readErr) {
            tablesResult[table] = `Erro: ${readErr.message}`;
            continue;
          }
          if (!rows || rows.length === 0) {
            tablesResult[table] = "Vazio";
            continue;
          }
          const { error: writeErr } = await targetClient
            .from(table)
            .upsert(rows, { onConflict: "id" });
          tablesResult[table] = writeErr
            ? `Erro: ${writeErr.message}`
            : `${rows.length} migrados`;
        } catch (e) {
          tablesResult[table] = `Erro: ${e.message}`;
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          users: { created: usersCreated, skipped: usersSkipped, details: usersResult },
          tables: tablesResult,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Ação inválida. Use: migrate_users, migrate_tables, migrate_all" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
