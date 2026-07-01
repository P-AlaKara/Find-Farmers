import { createClient } from "npm:@supabase/supabase-js@2";
import { applyHarvestDateFilters } from "./harvest.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "GET") {
      return json(405, { status: 405, message: "Method not allowed" });
    }

    const expectedKey = Deno.env.get("EXTERNAL_API_KEY");
    const providedKey = req.headers.get("x-api-key");
    if (!expectedKey || !providedKey || providedKey !== expectedKey) {
      return json(401, { status: 401, message: "Unauthorized" });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const url = new URL(req.url);
    const qp = url.searchParams;

    let query = supabase
      .from("farmers")
      .select(
        "farmer_id, full_name, phone_number, email, county, ward, specific_location, potato_variety, acreage_planted, planting_date, listing_status",
      )
      .eq("registration_status", "approved")
      .eq("listing_status", "available");

    const county = qp.get("county");
    const ward = qp.get("ward");
    const specific_location = qp.get("specific_location");
    const potato_variety = qp.get("potato_variety");
    const min_acreage = qp.get("min_acreage");
    const max_acreage = qp.get("max_acreage");
    const harvest_date_from = qp.get("harvest_date_from");
    const harvest_date_to = qp.get("harvest_date_to");

    if (county) query = query.ilike("county", county);
    if (ward) query = query.ilike("ward", ward);
    if (specific_location) query = query.ilike("specific_location", `%${specific_location}%`);
    if (potato_variety) query = query.ilike("potato_variety", potato_variety);
    if (min_acreage) query = query.gte("acreage_planted", Number(min_acreage));
    if (max_acreage) query = query.lte("acreage_planted", Number(max_acreage));
    const { data, error } = await query;

    if (error) {
      console.error("Query error:", error);
      return json(500, { status: 500, message: "Internal server error" });
    }

    if (!data || data.length === 0) {
      return json(404, { status: 404, message: "No farmers match the provided filters" });
    }

    const filtered = applyHarvestDateFilters(data, { harvest_date_from, harvest_date_to });

    if (filtered.length === 0) {
      return json(404, { status: 404, message: "No farmers match the provided filters" });
    }

    const enriched = filtered.map((f) => {
      const farm_acreage = Number(f.acreage_planted);
      const price_per_acre = 5000;

      return {
        ...f,
        farm_acreage,
        price_per_acre,
        estimated_total_amount: Number.isFinite(farm_acreage) ? farm_acreage * price_per_acre : null,
      };
    });

    return json(200, { status: 200, data: enriched });
  } catch (err) {
    console.error("Unexpected error:", err);
    return json(500, { status: 500, message: "Internal server error" });
  }
});
