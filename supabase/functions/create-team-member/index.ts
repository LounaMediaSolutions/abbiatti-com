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

    // Caller's profile -> org
    const { data: callerProfile } = await userClient
      .from("profiles").select("organization_id").eq("id", user.id).maybeSingle();
    const orgId = callerProfile?.organization_id;
    if (!orgId) return json({ error: "No organization" }, 400);

    // Caller roles
    const { data: callerRoles } = await userClient
      .from("user_roles").select("role").eq("user_id", user.id).eq("organization_id", orgId);
    const roles = (callerRoles ?? []).map((r) => r.role);
    const isAdmin = roles.includes("admin");
    const isCohost = roles.includes("cohost");
    if (!isAdmin && !isCohost) return json({ error: "Forbidden" }, 403);

    // Authorization rules
    if (role === "admin" && !isAdmin) return json({ error: "Only admin can create admin" }, 403);
    if (role === "cohost" && !isAdmin) return json({ error: "Only admin can create cohost" }, 403);
    if (role === "co_admin" && !isAdmin) return json({ error: "Only admin can create co-admin" }, 403);

    // For cohost callers creating staff, ensure all property_ids are properties they cohost
    if (!isAdmin && property_ids?.length) {
      const { data: cohostProps } = await userClient
        .from("property_members")
        .select("property_id")
        .eq("user_id", user.id)
        .eq("role", "cohost");
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

    // Override profile org (handle_new_user trigger creates a separate org by default)
    await admin.from("profiles").update({
      organization_id: orgId,
      full_name: full_name ?? "",
      phone: phone ?? "",
    }).eq("id", newUserId);

    // Remove auto-created admin role (in fresh org) and set proper role in caller's org
    await admin.from("user_roles").delete().eq("user_id", newUserId);
    await admin.from("user_roles").insert({
      user_id: newUserId,
      organization_id: orgId,
      role,
    });

    // Property assignments (skip for co_admin: org-wide access, no per-property entry)
    if (property_ids?.length && role !== "co_admin") {
      const rows = property_ids.map((pid: string) => ({
        property_id: pid,
        user_id: newUserId,
        organization_id: orgId,
        role,
        assigned_by: user.id,
      }));
      await admin.from("property_members").insert(rows);
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
