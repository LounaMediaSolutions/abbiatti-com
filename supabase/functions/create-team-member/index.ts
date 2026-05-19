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

    const { email, password, full_name, phone, role, property_ids, target_org_id } = await req.json();
    if (!email || !role) return json({ error: "Missing fields" }, 400);

    // Caller profile -> org + role
    const { data: callerProfile } = await userClient
      .from("profiles")
      .select("org_id, role")
      .eq("id", user.id)
      .maybeSingle();
    const callerRole = callerProfile?.role;
    const isSuperAdmin = callerRole === "super_admin";
    // Super-admin may target a specific organization; everyone else operates in their own org.
    const orgId = isSuperAdmin && target_org_id ? target_org_id : callerProfile?.org_id;
    if (!orgId) return json({ error: "No organization" }, 400);
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

    // Look up the user by email so we can either reuse an existing account
    // (no password required) or create a fresh one (password required).
    const existingUserId = await findUserIdByEmail(admin, email);
    const isExistingUser = !!existingUserId;

    if (!isExistingUser && !password) {
      return json(
        { error: "Password is required for new users" },
        400,
      );
    }

    let newUserId: string;
    if (existingUserId) {
      newUserId = existingUserId;
    } else {
      // Create user (auto-confirm so they can sign in immediately with the temp password).
      // skip_org_create tells the public.handle_new_user() trigger not to spawn a default
      // "My Agency" org for invited users — the Edge Function attaches them to `orgId` below.
      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: full_name ?? "",
          phone: phone ?? "",
          skip_org_create: "true",
        },
      });
      if (cErr || !created.user) {
        return json({ error: cErr?.message ?? "Create failed" }, 400);
      }
      newUserId = created.user.id;
    }

    // Safety net: if the DB still has the old trigger (i.e. the latest migration
    // hasn't been deployed yet), it will have already created an orphan org and
    // pointed the new profile at it. Detect that and delete the orphan so it
    // doesn't pollute the super-admin org list.
    const { data: triggerProfile } = await admin
      .from("profiles")
      .select("org_id")
      .eq("id", newUserId)
      .maybeSingle();
    const strayOrgId = triggerProfile?.org_id;
    if (strayOrgId && strayOrgId !== orgId) {
      // Detach the profile from the stray org first so the FK doesn't block us.
      await admin
        .from("profiles")
        .update({ org_id: null })
        .eq("id", newUserId);
      await admin
        .from("organizations")
        .delete()
        .eq("id", strayOrgId);
    }

    // Super-admin inviting an admin: write a pending invitation instead of an
    // immediate org membership. The invited user must accept on first login.
    const isPendingAdminInvite = isSuperAdmin && role === "admin";

    if (isPendingAdminInvite) {
      // For an existing user we preserve their current org_id/role so the
      // invitation lives *alongside* their existing access — they keep being
      // able to use the app as whatever they already are, and decide whether
      // to accept the invite later. For a brand-new account, clear any
      // default-org created by the signup trigger.
      const baseUpdate: Record<string, unknown> = {
        email,
        full_name: full_name ?? "",
        phone: phone ?? "",
        pending_org_id: orgId,
        pending_role: "admin",
        invited_by: user.id,
        invitation_status: "pending",
      };
      if (!isExistingUser) {
        baseUpdate.org_id = null;
        baseUpdate.role = null;
      }
      await admin.from("profiles").update(baseUpdate).eq("id", newUserId);

      return json({
        user_id: newUserId,
        status: "pending",
        existing_user: isExistingUser,
      });
    }

    // Override profile org/role. For an existing user we leave their
    // full_name/phone alone unless the inviter explicitly supplied new
    // values, so we don't blank out details they've already filled in.
    const profileUpdate: Record<string, unknown> = {
      org_id: orgId,
      role,
      email,
    };
    if (!isExistingUser || (full_name ?? "").trim()) {
      profileUpdate.full_name = full_name ?? "";
    }
    if (!isExistingUser || (phone ?? "").trim()) {
      profileUpdate.phone = phone ?? "";
    }
    await admin.from("profiles").update(profileUpdate).eq("id", newUserId);

    if (role === "cohost") {
      await admin.from("property_cohosts").delete().eq("user_id", newUserId);
      await admin.from("property_members").delete().eq("user_id", newUserId).eq("role", "cohost");
    }
    if (property_ids?.length && role === "cohost") {
      const cohostRows = property_ids.map((pid: string) => ({
        property_id: pid,
        user_id: newUserId,
        assigned_by: user.id,
        permissions: ["manage_properties", "manage_reservations", "manage_tasks", "manage_staff"],
      }));
      await admin.from("property_cohosts").insert(cohostRows);

      const memberRows = property_ids.map((pid: string) => ({
        property_id: pid,
        user_id: newUserId,
        organization_id: orgId,
        role,
        assigned_by: user.id,
      }));
      await admin.from("property_members").insert(memberRows);
    }

    if (property_ids?.length && role !== "cohost" && role !== "admin" && role !== "co_admin" && role !== "super_admin") {
      const memberRows = property_ids.map((pid: string) => ({
        property_id: pid,
        user_id: newUserId,
        organization_id: orgId,
        role,
        assigned_by: user.id,
      }));
      await admin.from("property_members").insert(memberRows);
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

// Returns the auth.users.id for the given email, or null if no user exists.
// Uses the admin auth API rather than a profiles lookup so we catch users who
// have an auth account but no profile row yet.
async function findUserIdByEmail(
  admin: ReturnType<typeof createClient>,
  email: string,
): Promise<string | null> {
  // Prefer the profiles row when present — it's a cheap indexed lookup and
  // avoids paging through every auth user.
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (profile?.id) return profile.id as string;

  // Fall back to listing auth users (matches the address case-insensitively
  // the way Supabase auth does).
  const target = email.trim().toLowerCase();
  let page = 1;
  // perPage caps at 1000; pagination keeps this safe for larger projects.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) return null;
    const match = data.users.find(
      (u) => (u.email ?? "").trim().toLowerCase() === target,
    );
    if (match) return match.id;
    if (data.users.length < 1000) return null;
    page += 1;
  }
}
