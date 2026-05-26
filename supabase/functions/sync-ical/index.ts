/**
 * sync-ical — Supabase Edge Function (Deno)
 *
 * Fetches one or more `property_ical_feeds` rows, downloads each iCal URL,
 * parses VEVENT blocks, and upserts the resulting stays into the `bookings`
 * table (the live schema — the legacy `reservations` table does not exist).
 * Updates `last_synced_at`, `last_synced_count`, and `last_error` on each
 * feed.
 *
 * Invocation
 * ----------
 * From IcalManager.tsx "Sync now":
 *   supabase.functions.invoke("sync-ical", { body: { feed_id } })
 *
 * Batch (every active feed) via cron — pass an empty body:
 *   curl -X POST <FUNCTION_URL> \
 *        -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
 *        -H "Content-Type: application/json" --data '{}'
 *
 * pg_cron schedule (hourly):
 *   SELECT cron.schedule(
 *     'sync-ical-hourly', '0 * * * *',
 *     $$ SELECT net.http_post(
 *          url := 'https://<project>.functions.supabase.co/sync-ical',
 *          headers := '{"Authorization": "Bearer <SERVICE_ROLE_KEY>",
 *                       "Content-Type": "application/json"}'::jsonb,
 *          body := '{}'::jsonb) $$);
 *
 * Response: { ok: true, results: [{ feed_id, ok, count, error? }, ...] }
 *
 * The function uses SERVICE_ROLE_KEY so it can write to bookings + feeds
 * regardless of caller session. Authorization is gated by Supabase Functions
 * auth — only authenticated users (or anyone with the service role key for
 * cron) can invoke. For single-feed sync, the caller passes feed_id and we
 * scope the upsert to that one feed.
 */

// deno-lint-ignore-file no-explicit-any
import {
  createClient,
  SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2.45.4";

type FeedRow = {
  id: string;
  organization_id: string;
  property_id: string;
  source: string;
  ical_url: string;
  active: boolean;
};

type ParsedEvent = {
  uid: string;
  dtstart: string; // YYYY-MM-DD
  dtend: string;   // YYYY-MM-DD (exclusive)
  summary: string | null;
  description: string | null;
  status: string | null;
};

type SyncResult =
  | { feed_id: string; ok: true; count: number }
  | { feed_id: string; ok: false; count: 0; error: string };

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ─── iCal parser ──────────────────────────────────────────────────────

/** Unfold continuation lines per RFC 5545 §3.1. */
function unfold(raw: string): string[] {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length > 0) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

function parseICalDate(value: string): string | null {
  const compact = value.replace(/[^\dTZ]/g, "");
  if (compact.length < 8) return null;
  const y = compact.slice(0, 4);
  const m = compact.slice(4, 6);
  const d = compact.slice(6, 8);
  if (!/^\d{4}$/.test(y) || !/^\d{2}$/.test(m) || !/^\d{2}$/.test(d)) {
    return null;
  }
  return `${y}-${m}-${d}`;
}

function valueOf(line: string): string {
  const idx = line.indexOf(":");
  return idx >= 0 ? line.slice(idx + 1) : "";
}

function nameOf(line: string): string {
  const c = line.indexOf(":");
  const head = c >= 0 ? line.slice(0, c) : line;
  const s = head.indexOf(";");
  return (s >= 0 ? head.slice(0, s) : head).toUpperCase();
}

function parseIcal(text: string): ParsedEvent[] {
  const lines = unfold(text);
  const events: ParsedEvent[] = [];
  let cur: Partial<ParsedEvent> | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      cur = {};
    } else if (line === "END:VEVENT") {
      if (cur && cur.uid && cur.dtstart && cur.dtend) {
        events.push({
          uid: cur.uid,
          dtstart: cur.dtstart,
          dtend: cur.dtend,
          summary: cur.summary ?? null,
          description: cur.description ?? null,
          status: cur.status ?? null,
        });
      }
      cur = null;
    } else if (cur) {
      const n = nameOf(line);
      switch (n) {
        case "UID":
          cur.uid = valueOf(line).trim();
          break;
        case "DTSTART":
          cur.dtstart = parseICalDate(valueOf(line)) ?? undefined;
          break;
        case "DTEND":
          cur.dtend = parseICalDate(valueOf(line)) ?? undefined;
          break;
        case "SUMMARY":
          cur.summary = valueOf(line).trim();
          break;
        case "DESCRIPTION":
          cur.description = valueOf(line).replace(/\\n/g, "\n").trim();
          break;
        case "STATUS":
          cur.status = valueOf(line).trim().toUpperCase();
          break;
      }
    }
  }
  return events;
}

// ─── Sync core ────────────────────────────────────────────────────────

function nightsBetween(checkin: string, checkout: string): number {
  const a = new Date(checkin + "T00:00:00Z").getTime();
  const b = new Date(checkout + "T00:00:00Z").getTime();
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/** iCal channel conventions vary. Airbnb uses "Reserved" for a real stay
 *  and "Not available" / "Blocked" for owner blocks. We import both as
 *  bookings but tag the status accordingly. */
function statusFromEvent(e: ParsedEvent): string {
  const haystack = `${e.summary ?? ""} ${e.status ?? ""}`.toLowerCase();
  if (
    haystack.includes("not available") ||
    haystack.includes("blocked") ||
    e.status === "CANCELLED"
  ) {
    return "blocked";
  }
  return "confirmed";
}

/** Generate a short, sortable booking reference. The bookings table requires
 *  ref_number (NOT NULL, no default), and on UPDATE we want to leave the
 *  existing value alone — so this is only used on first INSERT. */
function generateRefNumber(uid: string): string {
  const safe = uid.replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toUpperCase();
  const stamp = Date.now().toString(36).toUpperCase();
  return `ICAL-${stamp}-${safe || "X"}`;
}

async function syncOneFeed(
  admin: SupabaseClient,
  feed: FeedRow,
): Promise<SyncResult> {
  try {
    const resp = await fetch(feed.ical_url, {
      headers: { Accept: "text/calendar, application/calendar+xml, */*" },
    });
    if (!resp.ok) {
      throw new Error(`Upstream HTTP ${resp.status}`);
    }
    const body = await resp.text();
    if (!body.includes("BEGIN:VCALENDAR")) {
      throw new Error("Response is not an iCalendar feed");
    }
    const events = parseIcal(body);

    let imported = 0;
    let lastWriteError: string | null = null;
    for (const e of events) {
      const status = statusFromEvent(e);
      const nights = nightsBetween(e.dtstart, e.dtend);
      // `customer_name` is NOT NULL on the live `bookings` schema. Channels
      // other than Airbnb (Booking.com, Vrbo, …) often ship VEVENTs without
      // a SUMMARY, so default to a sensible per-channel placeholder instead
      // of `null` to keep the constraint happy.
      const guestName =
        e.summary?.trim() ||
        (feed.source === "airbnb" ? "Airbnb guest" : `${feed.source} guest`);

      // Two-step write because:
      //   1) PostgREST upsert(onConflict) can't target the partial unique
      //      index (WHERE channel_ref IS NOT NULL) shipped in the original
      //      migration. A follow-up migration replaces it with a full
      //      unique index, but to stay compatible with deployments that
      //      haven't run it yet we just do SELECT → INSERT-or-UPDATE here.
      //   2) `ref_number` is NOT NULL with no DB default. We only want to
      //      generate one on INSERT, not overwrite an existing booking's
      //      reference on every re-sync.
      const { data: existing } = await admin
        .from("bookings")
        .select("id")
        .eq("property_id", feed.property_id)
        .eq("channel_slug", feed.source)
        .eq("channel_ref", e.uid)
        .maybeSingle();

      const sharedFields = {
        org_id: feed.organization_id,
        property_id: feed.property_id,
        channel_slug: feed.source,
        channel_ref: e.uid,
        checkin: e.dtstart,
        checkout: e.dtend,
        nights,
        status,
        customer_name: guestName,
      };

      const { error } = existing?.id
        ? await admin.from("bookings").update(sharedFields).eq("id", existing.id)
        : await admin
            .from("bookings")
            .insert({ ...sharedFields, ref_number: generateRefNumber(e.uid) });
      if (error) {
        // One bad row shouldn't abort the whole feed — log and continue.
        console.warn(`write failed for UID ${e.uid}: ${error.message}`);
        lastWriteError = error.message;
        continue;
      }
      imported++;
    }

    // If the feed had events but every single write failed, that's a real
    // failure, not a 0-event sync. Surface it so the UI can show why nothing
    // came through instead of a misleading "synced 0 events" toast.
    if (events.length > 0 && imported === 0 && lastWriteError) {
      throw new Error(
        `Parsed ${events.length} events but none could be written: ${lastWriteError}`,
      );
    }

    await admin
      .from("property_ical_feeds")
      .update({
        last_synced_at: new Date().toISOString(),
        last_synced_count: imported,
        last_error: null,
      })
      .eq("id", feed.id);

    return { feed_id: feed.id, ok: true, count: imported };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await admin
      .from("property_ical_feeds")
      .update({
        last_synced_at: new Date().toISOString(),
        last_error: message.slice(0, 500),
      })
      .eq("id", feed.id);
    return { feed_id: feed.id, ok: false, count: 0, error: message };
  }
}

// ─── HTTP entrypoint ──────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: CORS_HEADERS,
    });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return new Response(
      JSON.stringify({ ok: false, error: "Function env not configured" }),
      {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let payload: any = {};
  try {
    const raw = await req.text();
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = {};
  }

  let feeds: FeedRow[];
  if (payload.feed_id) {
    const { data, error } = await admin
      .from("property_ical_feeds")
      .select("id, organization_id, property_id, source, ical_url, active")
      .eq("id", payload.feed_id)
      .maybeSingle();
    if (error || !data) {
      return new Response(
        JSON.stringify({ ok: false, error: error?.message ?? "Feed not found" }),
        {
          status: 404,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        },
      );
    }
    feeds = [data as FeedRow];
  } else {
    const { data, error } = await admin
      .from("property_ical_feeds")
      .select("id, organization_id, property_id, source, ical_url, active")
      .eq("active", true);
    if (error) {
      return new Response(
        JSON.stringify({ ok: false, error: error.message }),
        {
          status: 500,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        },
      );
    }
    feeds = (data ?? []) as FeedRow[];
  }

  const results: SyncResult[] = [];
  for (const feed of feeds) {
    results.push(await syncOneFeed(admin, feed));
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});
