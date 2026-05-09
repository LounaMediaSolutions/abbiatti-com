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

    const { email, phone, password, full_name, language, reservation_id, property_id } = await req.json();
    if ((!email && !phone) || !password) return json({ error: "Email or phone + password required" }, 400);

    const { data: callerProfile } = await userClient
      .from("profiles").select("organization_id").eq("id", user.id).maybeSingle();
    const orgId = callerProfile?.organization_id;
    if (!orgId) return json({ error: "No organization" }, 400);

    const { data: callerRoles } = await userClient
      .from("user_roles").select("role").eq("user_id", user.id).eq("organization_id", orgId);
    const roles = (callerRoles ?? []).map((r) => r.role);
    if (!roles.includes("admin") && !roles.includes("cohost")) {
      return json({ error: "Forbidden" }, 403);
    }

    // Compute delete_after = checkout + 3 days, or now + 14 days
    let deleteAfter = new Date(Date.now() + 14 * 86400_000);
    let resPropertyId = property_id ?? null;
    if (reservation_id) {
      const { data: r } = await admin.from("reservations")
        .select("check_out, property_id, organization_id").eq("id", reservation_id).maybeSingle();
      if (r && r.organization_id === orgId) {
        if (r.check_out) deleteAfter = new Date(new Date(r.check_out).getTime() + 3 * 86400_000);
        if (!resPropertyId) resPropertyId = r.property_id;
      }
    }

    const createPayload: any = {
      password,
      email_confirm: true,
      phone_confirm: true,
      user_metadata: {
        full_name: full_name ?? "",
        phone: phone ?? "",
        language: language ?? "fr",
        is_guest: true,
      },
    };
    if (email) createPayload.email = email;
    if (phone) createPayload.phone = phone;

    const { data: created, error: cErr } = await admin.auth.admin.createUser(createPayload);
    if (cErr || !created.user) return json({ error: cErr?.message ?? "Create failed" }, 400);
    const newUserId = created.user.id;

    // Override profile org and remove the auto-created admin role + org
    const { data: prof } = await admin.from("profiles").select("organization_id").eq("id", newUserId).maybeSingle();
    const autoOrgId = prof?.organization_id;
    await admin.from("profiles").update({
      organization_id: orgId,
      full_name: full_name ?? "",
      phone: phone ?? "",
      language: language ?? "fr",
    }).eq("id", newUserId);

    await admin.from("user_roles").delete().eq("user_id", newUserId);
    await admin.from("user_roles").insert({
      user_id: newUserId,
      organization_id: orgId,
      role: "guest",
    });
    if (autoOrgId && autoOrgId !== orgId) {
      await admin.from("organizations").delete().eq("id", autoOrgId);
    }

    const { data: ga, error: gaErr } = await admin.from("guest_accounts").insert({
      user_id: newUserId,
      organization_id: orgId,
      reservation_id: reservation_id ?? null,
      property_id: resPropertyId,
      full_name: full_name ?? null,
      email: email ?? null,
      phone: phone ?? null,
      language: language ?? "fr",
      delete_after: deleteAfter.toISOString(),
      created_by: user.id,
    }).select("id").single();
    if (gaErr) return json({ error: gaErr.message }, 400);

    return json({ user_id: newUserId, guest_account_id: ga.id, delete_after: deleteAfter.toISOString() });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
