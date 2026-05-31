// staff-qr-issue — issue a REUSABLE QR sign-in token for an employee.
//
// Caller must be ABOVE the employee with access to them: super_admin (any
// employee), admin/co_admin (own org), or a cohost who shares a property with
// the employee — see callerCanManageEmployee. The target MUST be an employee
// (cleaner / driver / decorator / maintenance / staff), read from the canonical
// profiles.role. We store only the SHA-256 hash of the token; the raw token is
// returned ONCE to the caller, who encodes it into a QR image. Issuing revokes
// the employee's previous active token.
//
// verify_jwt = true (see supabase/config.toml).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Roles a QR token may be issued for. Mirror of EMPLOYEE_ROLES in src/lib/access.ts.
const EMPLOYEE_ROLES = ["cleaner", "driver", "decorator", "maintenance", "staff"];

/**
 * "Anyone above the employee who has access to them" may issue/revoke a QR:
 *   - super_admin → any employee;
 *   - admin / co_admin → any employee in their own org;
 *   - anyone else (cohost, by role OR by property assignment) → only employees
 *     who share a property with them (property_cohosts ∩ property_members).
 * Roles are read from profiles (canonical); cohost access is derived from
 * property assignments so it works regardless of the caller's profiles.role.
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
  // Cohost path: must cohost a property the employee is assigned to.
  const { data: cohostProps } = await admin
    .from("property_cohosts").select("property_id").eq("user_id", callerId);
  const propIds = (cohostProps ?? []).map((r) => r.property_id);
  if (propIds.length === 0) return false;
  const { data: shared } = await admin
    .from("property_members").select("property_id")
    .eq("user_id", targetId).in("property_id", propIds).limit(1);
  return !!(shared && shared.length > 0);
}

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

    // Caller's role + org. Role is read from profiles — the app's canonical
    // source (employees created by create-team-member only get profiles.role +
    // property_members, never a user_roles row, so user_roles is unreliable).
    const { data: callerProfile } = await userClient
      .from("profiles").select("org_id, role").eq("id", user.id).maybeSingle();

    // Target must exist and be an EMPLOYEE (single canonical role on profiles).
    const { data: targetProfile } = await admin
      .from("profiles").select("org_id, role").eq("id", target_user_id).maybeSingle();
    if (!targetProfile?.org_id) return json({ error: "Target has no organization" }, 400);
    const tokenOrg = targetProfile.org_id as string;
    if (!EMPLOYEE_ROLES.includes(targetProfile.role)) {
      return json({ error: "QR login is only for employees" }, 403);
    }

    // Anyone above the employee who has access to them may issue: super-admin
    // (any), org admin/co_admin (own org), or a cohost who shares a property
    // with the employee.
    const canManage = await callerCanManageEmployee(
      admin,
      user.id,
      callerProfile?.role ?? null,
      callerProfile?.org_id ?? null,
      target_user_id,
      tokenOrg,
    );
    if (!canManage) return json({ error: "Forbidden" }, 403);

    // Generate a 256-bit random token (not brute-forceable) and store its hash.
    const rawToken = base64url(crypto.getRandomValues(new Uint8Array(32)));
    const tokenHash = await sha256Hex(rawToken);

    // Revoke the employee's previous active token(s): one active QR per person.
    await admin
      .from("staff_login_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("user_id", target_user_id)
      .is("revoked_at", null);

    const { error: insErr } = await admin.from("staff_login_tokens").insert({
      user_id: target_user_id,
      organization_id: tokenOrg,
      token_hash: tokenHash,
      created_by: user.id,
    });
    if (insErr) return json({ error: insErr.message }, 400);

    // Raw token returned ONCE. Caller builds the URL: <origin>/qr-login#t=<token>
    return json({ token: rawToken });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
