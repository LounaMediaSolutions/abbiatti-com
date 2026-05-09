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

    const { target_user_id, redirect_to } = await req.json();
    if (!target_user_id) return json({ error: "Missing target_user_id" }, 400);

    // Caller org
    const { data: callerProfile } = await userClient
      .from("profiles").select("organization_id").eq("id", user.id).maybeSingle();
    const orgId = callerProfile?.organization_id;
    if (!orgId) return json({ error: "No organization" }, 400);

    // Caller must be admin or cohost
    const { data: callerRoles } = await userClient
      .from("user_roles").select("role").eq("user_id", user.id).eq("organization_id", orgId);
    const roles = (callerRoles ?? []).map((r) => r.role);
    if (!roles.includes("admin") && !roles.includes("cohost")) {
      return json({ error: "Forbidden" }, 403);
    }

    // Target must belong to same org
    const { data: targetRoles } = await admin
      .from("user_roles").select("role").eq("user_id", target_user_id).eq("organization_id", orgId);
    if (!targetRoles || targetRoles.length === 0) {
      return json({ error: "User not in your organization" }, 403);
    }

    // Get email from auth.users
    const { data: targetUser, error: tErr } = await admin.auth.admin.getUserById(target_user_id);
    if (tErr || !targetUser?.user?.email) return json({ error: "Target not found" }, 404);

    const { data: linkData, error: lErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: targetUser.user.email,
      options: { redirectTo: redirect_to ?? undefined },
    });
    if (lErr) return json({ error: lErr.message }, 400);

    return json({
      email: targetUser.user.email,
      action_link: linkData.properties?.action_link,
    });
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
