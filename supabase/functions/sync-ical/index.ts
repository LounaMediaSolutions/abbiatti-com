import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface IcalEvent {
  uid: string;
  summary: string;
  description: string;
  start: string; // YYYY-MM-DD
  end: string;
}

function parseIcal(text: string): IcalEvent[] {
  // Unfold lines (RFC 5545: lines starting with space/tab continue previous)
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  const lines = unfolded.split(/\r?\n/);
  const events: IcalEvent[] = [];
  let cur: Partial<IcalEvent> | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") cur = {};
    else if (line === "END:VEVENT") {
      if (cur && cur.uid && cur.start && cur.end) events.push(cur as IcalEvent);
      cur = null;
    } else if (cur) {
      const idx = line.indexOf(":");
      if (idx === -1) continue;
      const keyPart = line.substring(0, idx);
      const value = line.substring(idx + 1);
      const key = keyPart.split(";")[0].toUpperCase();
      if (key === "UID") cur.uid = value.trim();
      else if (key === "SUMMARY") cur.summary = value.trim();
      else if (key === "DESCRIPTION") cur.description = value.replace(/\\n/g, "\n").trim();
      else if (key === "DTSTART") cur.start = normalizeDate(value);
      else if (key === "DTEND") cur.end = normalizeDate(value);
    }
  }
  return events;
}

function normalizeDate(v: string): string {
  // Accept YYYYMMDD or YYYYMMDDTHHMMSSZ
  const d = v.replace(/[TZ].*/, "");
  if (d.length === 8) return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  return d;
}

function detectStatus(summary: string): "blocked" | "confirmed" {
  const s = (summary || "").toLowerCase();
  if (s.includes("not available") || s.includes("blocked") || s.includes("airbnb (not available)")) return "blocked";
  return "confirmed";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let feedFilter: string | null = null;
  try {
    const body = await req.json();
    feedFilter = body?.feed_id ?? null;
  } catch (_) { /* no body */ }

  const query = supabase.from("property_ical_feeds").select("*").eq("active", true);
  if (feedFilter) query.eq("id", feedFilter);
  const { data: feeds, error: feedsErr } = await query;

  if (feedsErr) {
    return new Response(JSON.stringify({ error: feedsErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: Array<{ feed_id: string; ok: boolean; count?: number; error?: string }> = [];

  for (const feed of feeds ?? []) {
    try {
      const resp = await fetch(feed.ical_url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const text = await resp.text();
      const events = parseIcal(text);

      let upserted = 0;
      for (const ev of events) {
        const status = detectStatus(ev.summary);
        const { error: upErr } = await supabase
          .from("reservations")
          .upsert(
            {
              organization_id: feed.organization_id,
              property_id: feed.property_id,
              source: feed.source,
              external_id: ev.uid,
              external_code: ev.summary?.match(/[A-Z0-9]{8,}/)?.[0] ?? null,
              check_in: ev.start,
              check_out: ev.end,
              status,
              notes: ev.description || null,
              last_sync_at: new Date().toISOString(),
            },
            { onConflict: "property_id,source,external_id", ignoreDuplicates: false },
          );
        if (!upErr) upserted++;
      }

      await supabase
        .from("property_ical_feeds")
        .update({ last_synced_at: new Date().toISOString(), last_error: null })
        .eq("id", feed.id);

      results.push({ feed_id: feed.id, ok: true, count: upserted });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await supabase.from("property_ical_feeds").update({ last_error: msg }).eq("id", feed.id);
      results.push({ feed_id: feed.id, ok: false, error: msg });
    }
  }

  return new Response(JSON.stringify({ results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
