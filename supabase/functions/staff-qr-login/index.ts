// staff-qr-login — PUBLIC redemption endpoint for an employee QR token.
//
// The employee scans their QR (with any phone camera), which opens
// `/qr-login#t=<token>`. That page POSTs the raw token here. We:
//   1. hash it and look up an ACTIVE, non-expired token row;
//   2. re-verify the target is employee-only (defense in depth — a token must
//      never mint a session for a privileged account, even if one slipped in);
//   3. mint a fresh ONE-TIME magic-link OTP for the user's email and return its
//      `token_hash`, which the browser exchanges via supabase.auth.verifyOtp.
//
// The long-lived QR token never becomes a session directly; each scan produces a
// fresh single-use OTP. This endpoint is intentionally public (verify_jwt =
// false): the bearer token in the body IS the credential.
//
// Note: tokens are 256-bit random, so enumeration/brute force is infeasible; we
// also never reveal whether a hash existed beyond a generic 401.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EMPLOYEE_ROLES = ["cleaner", "driver", "decorator", "maintenance", "staff"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE);

    const body = await req.json().catch(() => ({}));
    const rawToken = typeof body?.token === "string" ? body.token.trim() : "";
    // Our tokens are 43-char base64url (32 bytes). Reject anything implausible
    // before hitting the DB.
    if (!rawToken || rawToken.length < 20 || rawToken.length > 200) {
      return json({ error: "invalid" }, 401);
    }

    const tokenHash = await sha256Hex(rawToken);

    const { data: row } = await admin
      .from("staff_login_tokens")
      .select("id, user_id, organization_id, expires_at, revoked_at")
      .eq("token_hash", tokenHash)
      .is("revoked_at", null)
      .maybeSingle();
    if (!row) return json({ error: "invalid" }, 401);

    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
      return json({ error: "expired" }, 401);
    }

    // Defense in depth: the token's user must still be an employee. The
    // canonical role lives on profiles (user_roles is not populated for
    // employees created via create-team-member), so check it there.
    const { data: targetProfile } = await admin
      .from("profiles").select("role").eq("id", row.user_id).maybeSingle();
    if (!targetProfile || !EMPLOYEE_ROLES.includes(targetProfile.role)) {
      return json({ error: "invalid" }, 401);
    }

    // Resolve the user's email to mint a one-time OTP.
    const { data: targetUser, error: tErr } = await admin.auth.admin.getUserById(row.user_id);
    const email = targetUser?.user?.email;
    if (tErr || !email) return json({ error: "invalid" }, 401);

    const { data: linkData, error: lErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    const otpHash = linkData?.properties?.hashed_token;
    if (lErr || !otpHash) return json({ error: "could_not_sign_in" }, 400);

    // Best-effort usage stamp (don't fail the login if this update fails).
    await admin
      .from("staff_login_tokens")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", row.id);

    // Browser completes login with supabase.auth.verifyOtp({ type: "magiclink", token_hash }).
    return json({ token_hash: otpHash });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

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
