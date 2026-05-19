import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// 100 years — Supabase auth interprets ban_duration as a Go duration string.
const FOREVER_BAN = "876600h";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing auth" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON =
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(SUPABASE_URL, SERVICE);

    const {
      data: { user },
      error: uErr,
    } = await userClient.auth.getUser();
    if (uErr || !user) return json({ error: "Unauthorized" }, 401);

    // Caller must be super_admin. profiles.role is the canonical column.
    const { data: profileRow } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (profileRow?.role !== "super_admin") {
      return json({ error: "Forbidden" }, 403);
    }

    const { user_id, banned } = await req.json();
    if (!user_id || typeof banned !== "boolean") {
      return json({ error: "Missing or invalid fields" }, 400);
    }
    if (user_id === user.id) {
      return json({ error: "Cannot ban yourself" }, 400);
    }

    // Prevent banning another super_admin (defence in depth).
    const { data: targetProfile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user_id)
      .maybeSingle();
    if (banned && targetProfile?.role === "super_admin") {
      return json({ error: "Cannot ban a super_admin" }, 400);
    }

    // 1. Toggle Supabase auth-level ban (prevents future logins / refresh).
    const { error: authErr } = await admin.auth.admin.updateUserById(user_id, {
      ban_duration: banned ? FOREVER_BAN : "none",
    } as { ban_duration: string });
    if (authErr) {
      return json({ error: authErr.message }, 400);
    }

    // 2. Mirror state on profiles.active so the UI / RLS can react.
    const { error: profErr } = await admin
      .from("profiles")
      .update({ active: !banned })
      .eq("id", user_id);
    if (profErr) {
      return json({ error: profErr.message }, 400);
    }

    return json({ user_id, banned });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
