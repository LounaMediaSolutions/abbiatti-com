// Scrape a public listing URL (Airbnb, Booking, Vrbo, etc.) using Firecrawl
// and return structured property data for prefilling the new-property form.
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const FIRECRAWL_V2 = "https://api.firecrawl.dev/v2";

const extractionSchema = {
  type: "object",
  properties: {
    name: { type: "string", description: "Listing title / property name" },
    property_type: {
      type: "string",
      enum: ["villa", "apartment", "house", "studio", "room", "other"],
    },
    city: { type: "string" },
    region: { type: "string", description: "Region, state or province" },
    country: { type: "string" },
    bedrooms: { type: "number", description: "Number of bedrooms (e.g. '2 bedrooms' => 2). Look at the headline like 'X guests · Y bedrooms · Z beds · W bath'." },
    bathrooms: { type: "number", description: "Number of bathrooms (e.g. '1 bath' => 1)" },
    max_guests: { type: "number", description: "Maximum number of guests the listing accepts (e.g. '7 guests' => 7)" },
    cover_image_url: { type: "string", description: "Best hero / cover image URL of the listing" },
    photos: {
      type: "array",
      items: { type: "string" },
      description: "Up to 10 photo URLs of the property",
    },
    notes: { type: "string", description: "Short summary / description of the property" },
  },
  required: ["bedrooms", "bathrooms", "max_guests"],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
    if (!apiKey) throw new Error("FIRECRAWL_API_KEY not configured");

    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "Missing url" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resp = await fetch(`${FIRECRAWL_V2}/scrape`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        onlyMainContent: true,
        waitFor: 2500,
        formats: [
          "markdown",
          {
            type: "json",
            schema: extractionSchema,
            prompt:
              "Extract the property listing details accurately. The page usually contains a line like '7 guests · 2 bedrooms · 2 beds · 1 bath' — parse those numbers carefully into max_guests, bedrooms, and bathrooms. property_type must be one of: villa, apartment, house, studio, room, other (an 'entire rental unit' or flat = apartment). Use the exact city/country shown (e.g. 'Béjaïa, Algeria').",
          },
        ],
      }),
    });

    const data = await resp.json();
    if (!resp.ok) {
      throw new Error(data?.error || `Firecrawl ${resp.status}`);
    }

    const doc = data?.data ?? data ?? {};
    const extracted: Record<string, unknown> = { ...(doc.json ?? {}) };
    const markdown: string = doc.markdown ?? "";

    // Fallback regex parsing from the markdown headline (Airbnb pattern)
    // e.g. "7 guests · 2 bedrooms · 2 beds · 1 bath"
    const num = (re: RegExp) => {
      const m = markdown.match(re);
      return m ? Number(m[1]) : undefined;
    };
    const guests = num(/(\d+)\s*guests?/i);
    const beds = num(/(\d+)\s*bedrooms?/i);
    const baths = num(/(\d+(?:\.\d+)?)\s*baths?/i);

    if (!extracted.max_guests && guests) extracted.max_guests = guests;
    if (!extracted.bedrooms && beds) extracted.bedrooms = beds;
    if (!extracted.bathrooms && baths) extracted.bathrooms = baths;

    // If extraction looks suspicious (defaults of 1/1/2), prefer regex when available
    if (extracted.bedrooms === 1 && beds && beds !== 1) extracted.bedrooms = beds;
    if (extracted.max_guests === 2 && guests && guests !== 2) extracted.max_guests = guests;
    if (extracted.bathrooms === 1 && baths && baths !== 1) extracted.bathrooms = baths;

    return new Response(JSON.stringify({ data: extracted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
