// @ts-nocheck
import { Inngest } from "npm:inngest@4.2.6";
import { serve } from "npm:inngest@4.2.6/deno/fresh";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
};

const inngest = new Inngest({ id: "louna-cohost" });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = () => createClient(SUPABASE_URL, SERVICE_ROLE);

const dailyRecap = inngest.createFunction(
  { id: "daily-cohost-recap", triggers: [{ cron: "0 18 * * *" }] },
  async ({ step }) => {
    const sb = admin();
    const today = new Date().toISOString().slice(0, 10);

    const { data: tasks } = await step.run("fetch-tasks", async () =>
      sb.from("tasks")
        .select("id, title, status, type, organization_id, property_id, completed_at")
        .gte("updated_at", `${today}T00:00:00Z`)
    );

    if (!tasks?.length) return { sent: 0, reason: "no tasks today" };

    const byOrg: Record<string, any[]> = {};
    tasks.forEach((t: any) => {
      byOrg[t.organization_id] = byOrg[t.organization_id] || [];
      byOrg[t.organization_id].push(t);
    });

    let totalNotifs = 0;
    for (const [orgId, list] of Object.entries(byOrg)) {
      const done = list.filter((t) => t.status === "done").length;
      const issue = list.filter((t) => t.status === "issue").length;
      const pending = list.filter((t) => !["done", "issue"].includes(t.status)).length;

      const title = `📊 Récap du ${today}`;
      const body = `✅ ${done} terminée(s) · ⚠️ ${issue} problème(s) · ⏳ ${pending} en attente`;

      const { data: cohosts } = await sb.from("user_roles")
        .select("user_id")
        .eq("organization_id", orgId)
        .in("role", ["admin", "cohost"]);

      for (const c of cohosts || []) {
        await sb.from("notifications").insert({
          organization_id: orgId,
          recipient_id: c.user_id,
          type: "daily_recap",
          title,
          body,
          link: "/tasks",
        });
        totalNotifs++;
      }
    }
    return { sent: totalNotifs };
  }
);

const manualRecap = inngest.createFunction(
  { id: "manual-recap", triggers: [{ event: "louna/recap.requested" }] },
  async ({ event }) => ({ ok: true, received: event.data })
);

const handler = serve({ client: inngest, functions: [dailyRecap, manualRecap] });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  const res = await handler(req);
  const newHeaders = new Headers(res.headers);
  Object.entries(corsHeaders).forEach(([k, v]) => newHeaders.set(k, v));
  return new Response(res.body, { status: res.status, headers: newHeaders });
});
