import { createClient } from "npm:@supabase/supabase-js@2";
import { authorizeMainPlatform, mainPlatformCorsHeaders, mainPlatformJson } from "../_shared/main-platform.ts";
import { getEstimatedHarvestDate } from "../external-get-farmers/harvest.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: mainPlatformCorsHeaders });
  if (req.method !== "GET") return mainPlatformJson(405, { status: 405, code: "method_not_allowed", message: "Method not allowed" });
  if (!authorizeMainPlatform(req)) return mainPlatformJson(401, { status: 401, code: "unauthorized", message: "Unauthorized" });

  try {
    const url = new URL(req.url);
    const farmerId = url.searchParams.get("farmer_id") || "";
    if (!farmerId) return mainPlatformJson(400, { status: 400, code: "missing_farmer_id", message: "farmer_id is required" });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: farmer, error } = await supabase
      .from("farmers")
      .select("farmer_id, external_platform_ref, full_name, phone_number, email, county, ward, specific_location, potato_variety, acreage_planted, planting_date, registration_status, listing_status, payment_status, registration_fee, created_at, updated_at")
      .eq("farmer_id", farmerId)
      .maybeSingle();
    if (error) throw error;
    if (!farmer) return mainPlatformJson(404, { status: 404, code: "farmer_not_found", message: "Farmer not found" });

    return mainPlatformJson(200, {
      status: 200,
      data: {
        ...farmer,
        farm_acreage: Number(farmer.acreage_planted),
        estimated_harvest_date: getEstimatedHarvestDate(farmer.planting_date, farmer.potato_variety),
      },
    });
  } catch (err) {
    console.error("main-platform-get-farmer error:", err);
    return mainPlatformJson(500, { status: 500, code: "internal_error", message: "Internal server error" });
  }
});
