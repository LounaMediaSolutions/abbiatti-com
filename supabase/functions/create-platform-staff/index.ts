import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_ROLES = ["technician", "developer", "accountant", "support", "super_admin"];

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

    // Verify caller is super_admin
    const { data: superRow } = await admin
      .from("user_roles").select("id").eq("user_id", user.id).eq("role", "super_admin").maybeSingle();
    if (!superRow) return json({ error: "Forbidden" }, 403);

    const { email, password, full_name, phone, role } = await req.json();
    if (!email || !password || !role) return json({ error: "Missing fields" }, 400);
    if (!ALLOWED_ROLES.includes(role)) return json({ error: "Invalid role" }, 400);

    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name ?? "", phone: phone ?? "" },
    });
    if (cErr || !created.user) return json({ error: cErr?.message ?? "Create failed" }, 400);

    const newUserId = created.user.id;

    // Platform staff = no organization. Clear org on profile and remove auto-created admin role.
    await admin.from("profiles").update({
      organization_id: null,
      full_name: full_name ?? "",
      phone: phone ?? "",
    }).eq("id", newUserId);

    // Remove the auto-created org (clean up handle_new_user side-effect)
    const { data: autoRoles } = await admin
      .from("user_roles").select("organization_id").eq("user_id", newUserId);
    await admin.from("user_roles").delete().eq("user_id", newUserId);
    for (const r of autoRoles ?? []) {
      if (r.organization_id) {
        await admin.from("organizations").delete().eq("id", r.organization_id);
      }
    }

    // Assign global platform role (organization_id NULL)
    await admin.from("user_roles").insert({
      user_id: newUserId,
      organization_id: null,
      role,
    });

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
