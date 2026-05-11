import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing auth" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(SUPABASE_URL, SERVICE);

    const { data: { user }, error: uErr } = await userClient.auth.getUser();
    if (uErr || !user) return json({ error: "Unauthorized" }, 401);

    const { email, password, full_name, phone, role, property_ids } = await req.json();
    if (!email || !password || !role) return json({ error: "Missing fields" }, 400);

    // Caller profile -> org + role
    const { data: callerProfile } = await userClient
      .from("profiles")
      .select("org_id, role")
      .eq("id", user.id)
      .maybeSingle();
    const orgId = callerProfile?.org_id;
    if (!orgId) return json({ error: "No organization" }, 400);
    const callerRole = callerProfile?.role;
    const isSuperAdmin = callerRole === "super_admin";
    const isAdmin = callerRole === "admin";
    const isCoAdmin = callerRole === "co_admin";
    const isCohost = callerRole === "cohost";
    if (!isSuperAdmin && !isAdmin && !isCoAdmin && !isCohost) return json({ error: "Forbidden" }, 403);

    // Authorization rules
    if (role === "super_admin" && !isSuperAdmin) return json({ error: "Only super admin can create super admin" }, 403);
    if (role === "admin" && !isSuperAdmin) return json({ error: "Only super admin can create admin" }, 403);
    if (role === "co_admin" && !isAdmin && !isSuperAdmin) return json({ error: "Only admin can create co-admin" }, 403);
    if (role === "cohost" && !isAdmin && !isSuperAdmin && !isCoAdmin) return json({ error: "Only admin can create cohost" }, 403);

    // For cohost callers creating staff, ensure all property_ids are within their assignments.
    if (isCohost && property_ids?.length) {
      const { data: cohostProps } = await userClient
        .from("property_cohosts")
        .select("property_id")
        .eq("user_id", user.id)
        .not("property_id", "is", null);
      const allowed = new Set((cohostProps ?? []).map((p) => p.property_id));
      for (const pid of property_ids) {
        if (!allowed.has(pid)) return json({ error: "Not your property" }, 403);
      }
    }

    // Create user (auto-confirm so they can sign in immediately with the temp password)
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name ?? "", phone: phone ?? "" },
    });
    if (cErr || !created.user) {
      return json({ error: cErr?.message ?? "Create failed" }, 400);
    }
    const newUserId = created.user.id;

    // Override profile org/role (signup trigger may create a personal org by default)
    await admin.from("profiles").update({
      org_id: orgId,
      role,
      email,
      full_name: full_name ?? "",
      phone: phone ?? "",
    }).eq("id", newUserId);

    // Property assignments are only tracked for cohosts in the current schema.
    if (role === "cohost") {
      await admin.from("property_cohosts").delete().eq("user_id", newUserId);
    }
    if (property_ids?.length && role === "cohost") {
      const rows = property_ids.map((pid: string) => ({
        property_id: pid,
        user_id: newUserId,
        assigned_by: user.id,
        permissions: ["manage_properties", "manage_reservations", "manage_tasks", "manage_staff"],
      }));
      await admin.from("property_cohosts").insert(rows);
    }

    return json({ user_id: newUserId });
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
