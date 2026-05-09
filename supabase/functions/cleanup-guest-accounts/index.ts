import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

/**
 * Build a single branded collage (1 image) from the guest's marketing-allowed
 * photos, overlaid with the agency logo, name, website and phone.
 * Returns a base64 data URL (PNG/JPEG) or null on failure.
 */
async function buildBrandedCollage(opts: {
  photoUrls: string[];
  logoUrl: string | null;
  orgName: string;
  website: string | null;
  phone: string | null;
}): Promise<string | null> {
  if (!LOVABLE_API_KEY || opts.photoUrls.length === 0) return null;

  const inputs: Array<{ type: string; image_url?: { url: string }; text?: string }> = [];
  const contactLine = [opts.website, opts.phone].filter(Boolean).join(" · ");
  inputs.push({
    type: "text",
    text:
      `Create a polished social-media collage (square 1:1, photo-album style) ` +
      `combining the following guest photos. Add a clean footer band with the agency ` +
      `logo on the left and the agency name "${opts.orgName}"` +
      (contactLine ? ` plus contact info "${contactLine}"` : "") +
      `. Keep photos crisp, modern, Instagram-ready. No watermark beyond the footer.`,
  });
  if (opts.logoUrl) {
    inputs.push({ type: "image_url", image_url: { url: opts.logoUrl } });
  }
  for (const url of opts.photoUrls.slice(0, 6)) {
    inputs.push({ type: "image_url", image_url: { url } });
  }

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [{ role: "user", content: inputs }],
        modalities: ["image", "text"],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.choices?.[0]?.message?.images?.[0]?.image_url?.url ?? null;
  } catch {
    return null;
  }
}

function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; mime: string } {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw new Error("Invalid data URL");
  const mime = m[1];
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, mime };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE);

  const { data: expired } = await admin
    .from("guest_accounts")
    .select("id, user_id, organization_id")
    .lt("delete_after", new Date().toISOString())
    .is("deleted_at", null);

  let removed = 0;
  let albums = 0;

  for (const g of expired ?? []) {
    // 1) Build branded album BEFORE purging the account.
    try {
      const { data: uploads } = await admin
        .from("guest_uploads")
        .select("storage_path")
        .eq("guest_account_id", g.id)
        .eq("marketing_use_allowed", true)
        .not("storage_path", "is", null);

      const photoUrls = (uploads ?? [])
        .map((u: any) =>
          admin.storage.from("guest-uploads").getPublicUrl(u.storage_path).data.publicUrl
        )
        .filter(Boolean);

      if (photoUrls.length > 0) {
        const { data: org } = await admin
          .from("organizations")
          .select("name, logo_url, website_contact_phone")
          .eq("id", g.organization_id)
          .single();

        const dataUrl = await buildBrandedCollage({
          photoUrls,
          logoUrl: org?.logo_url ?? null,
          orgName: org?.name ?? "Notre agence",
          website: null,
          phone: org?.website_contact_phone ?? null,
        });

        if (dataUrl) {
          const { bytes, mime } = dataUrlToBytes(dataUrl);
          const ext = mime.includes("jpeg") ? "jpg" : "png";
          const path = `${g.organization_id}/${g.id}-square-${Date.now()}.${ext}`;
          const { error: upErr } = await admin.storage
            .from("guest-albums")
            .upload(path, bytes, { contentType: mime, upsert: true });
          if (!upErr) {
            await admin.from("guest_albums").insert({
              organization_id: g.organization_id,
              guest_account_id: g.id,
              storage_path: path,
              photos_count: photoUrls.length,
              format: "square",
            });
            albums++;
          } else {
            await admin.from("guest_albums").insert({
              organization_id: g.organization_id,
              guest_account_id: g.id,
              storage_path: "",
              photos_count: photoUrls.length,
              format: "square",
              error: upErr.message,
            });
          }
        }
      }
    } catch (e) {
      await admin.from("guest_albums").insert({
        organization_id: g.organization_id,
        guest_account_id: g.id,
        storage_path: "",
        photos_count: 0,
        format: "square",
        error: (e as Error).message,
      });
    }

    // 2) Purge auth user + role; flag guest_account.
    try {
      await admin.auth.admin.deleteUser(g.user_id);
    } catch (_) { /* ignore */ }
    await admin.from("user_roles").delete().eq("user_id", g.user_id);
    await admin.from("guest_accounts").update({ deleted_at: new Date().toISOString() }).eq("id", g.id);
    removed++;
  }

  return new Response(JSON.stringify({ removed, albums }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
