import { createClient } from "npm:@supabase/supabase-js@2";
import { authorizeMainPlatform, mainPlatformCorsHeaders, mainPlatformJson } from "../_shared/main-platform.ts";

const allowedStatuses = new Set(["all", "pending_approval", "approved", "confirmed", "rejected"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: mainPlatformCorsHeaders });
  if (req.method !== "GET") return mainPlatformJson(405, { status: 405, code: "method_not_allowed", message: "Method not allowed" });
  if (!authorizeMainPlatform(req)) return mainPlatformJson(401, { status: 401, code: "unauthorized", message: "Unauthorized" });

  try {
    const url = new URL(req.url);
    const farmerId = url.searchParams.get("farmer_id") || "";
    const status = url.searchParams.get("status") || "all";
    if (!farmerId) return mainPlatformJson(400, { status: 400, code: "missing_farmer_id", message: "farmer_id is required" });
    if (!allowedStatuses.has(status)) return mainPlatformJson(400, { status: 400, code: "invalid_status", message: "status must be all, pending_approval, approved, confirmed, or rejected" });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: farmer, error: farmerErr } = await supabase
      .from("farmers")
      .select("id, farmer_id")
      .eq("farmer_id", farmerId)
      .maybeSingle();
    if (farmerErr) throw farmerErr;
    if (!farmer) return mainPlatformJson(404, { status: 404, code: "farmer_not_found", message: "Farmer not found" });

    let query = supabase
      .from("bookings")
      .select("id, acres_booked, price_per_acre, total_amount, payment_status, booking_status, source, external_booking_ref, farmer_confirmed_at, payment_requested_at, received_confirmed_at, final_price, delivery_date, buyer_rating, created_at, updated_at, buyers(buyer_name, company_name, phone_number, email, county)")
      .eq("farmer_id", farmer.id)
      .order("created_at", { ascending: false });
    if (status !== "all") query = query.eq("booking_status", status);

    const { data: bookings, error } = await query;
    if (error) throw error;

    return mainPlatformJson(200, {
      status: 200,
      data: (bookings || []).map((booking) => {
        const buyer = Array.isArray(booking.buyers) ? booking.buyers[0] : booking.buyers;
        return {
          booking_ref: booking.id,
          external_booking_ref: booking.external_booking_ref,
          farmer_id: farmer.farmer_id,
          acres_booked: booking.acres_booked,
          price_per_acre: booking.price_per_acre,
          total_amount: booking.total_amount,
          payment_status: booking.payment_status,
          booking_status: booking.booking_status,
          source: booking.source,
          farmer_confirmed_at: booking.farmer_confirmed_at,
          payment_requested_at: booking.payment_requested_at,
          received_confirmed_at: booking.received_confirmed_at,
          final_price: booking.final_price,
          delivery_date: booking.delivery_date,
          buyer_rating: booking.buyer_rating,
          created_at: booking.created_at,
          updated_at: booking.updated_at,
          buyer: {
            company_name: buyer?.company_name ?? buyer?.buyer_name ?? null,
            phone: buyer?.phone_number ?? null,
            email: buyer?.email ?? null,
            county: buyer?.county ?? null,
          },
        };
      }),
    });
  } catch (err) {
    console.error("main-platform-farmer-bookings error:", err);
    return mainPlatformJson(500, { status: 500, code: "internal_error", message: "Internal server error" });
  }
});
