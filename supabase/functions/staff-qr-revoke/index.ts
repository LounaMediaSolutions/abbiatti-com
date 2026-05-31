// staff-qr-revoke — revoke ALL active QR sign-in tokens for an employee.
//
// Caller must be an admin or cohost of the target's organization. Used by the
// "Disable QR" action so a manager can instantly kill a leaked/forwarded code.
//
// verify_jwt = true (see supabase/config.toml).

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

    const body = await req.json().catch(() => ({}));
    const target_user_id = body?.target_user_id as string | undefined;
    if (!target_user_id) return json({ error: "Missing target_user_id" }, 400);

    // Same authority as issuing (see callerCanManageEmployee): super-admin,
    // org admin/co_admin, or a cohost who shares a property with the employee.
    const { data: callerProfile } = await userClient
      .from("profiles").select("org_id, role").eq("id", user.id).maybeSingle();

    const { data: targetProfile } = await admin
      .from("profiles").select("org_id").eq("id", target_user_id).maybeSingle();
    if (!targetProfile?.org_id) return json({ error: "Target has no organization" }, 400);
    const tokenOrg = targetProfile.org_id as string;

    const canManage = await callerCanManageEmployee(
      admin,
      user.id,
      callerProfile?.role ?? null,
      callerProfile?.org_id ?? null,
      target_user_id,
      tokenOrg,
    );
    if (!canManage) return json({ error: "Forbidden" }, 403);

    const { error: upErr } = await admin
      .from("staff_login_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("user_id", target_user_id)
      .eq("organization_id", tokenOrg)
      .is("revoked_at", null);
    if (upErr) return json({ error: upErr.message }, 400);

    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

/**
 * Authority to manage an employee's QR (mirror of staff-qr-issue):
 *   - super_admin → any employee;
 *   - admin / co_admin → any employee in their own org;
 *   - anyone else (cohost by role or by assignment) → only employees who share
 *     a property with them (property_cohosts ∩ property_members).
 */
async function callerCanManageEmployee(
  admin: ReturnType<typeof createClient>,
  callerId: string,
  callerRole: string | null,
  callerOrg: string | null,
  targetId: string,
  tokenOrg: string,
): Promise<boolean> {
  if (callerRole === "super_admin") return true;
  if ((callerRole === "admin" || callerRole === "co_admin") && callerOrg && callerOrg === tokenOrg) {
    return true;
  }
  const { data: cohostProps } = await admin
    .from("property_cohosts").select("property_id").eq("user_id", callerId);
  const propIds = (cohostProps ?? []).map((r) => r.property_id);
  if (propIds.length === 0) return false;
  const { data: shared } = await admin
    .from("property_members").select("property_id")
    .eq("user_id", targetId).in("property_id", propIds).limit(1);
  return !!(shared && shared.length > 0);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
