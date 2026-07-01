import { createClient } from "npm:@supabase/supabase-js@2";
import { authorizeMainPlatform, mainPlatformCorsHeaders, mainPlatformJson } from "../_shared/main-platform.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: mainPlatformCorsHeaders });
  if (req.method !== "GET") return mainPlatformJson(405, { status: 405, code: "method_not_allowed", message: "Method not allowed" });
  if (!authorizeMainPlatform(req)) return mainPlatformJson(401, { status: 401, code: "unauthorized", message: "Unauthorized" });

  try {
    const url = new URL(req.url);
    const bookingRef = url.searchParams.get("booking_ref") || "";
    if (!bookingRef) return mainPlatformJson(400, { status: 400, code: "missing_booking_ref", message: "booking_ref is required" });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: booking, error } = await supabase
      .from("bookings")
      .select("id, acres_booked, price_per_acre, total_amount, payment_status, booking_status, source, external_booking_ref, payment_reference, farmer_confirmed_at, payment_requested_at, received_confirmed_at, final_price, delivery_date, buyer_rating, created_at, updated_at, farmers(farmer_id), buyers(buyer_name, company_name, phone_number, email, county)")
      .eq("id", bookingRef)
      .maybeSingle();
    if (error) throw error;
    if (!booking) return mainPlatformJson(404, { status: 404, code: "booking_not_found", message: "Booking not found" });

    const farmer = Array.isArray(booking.farmers) ? booking.farmers[0] : booking.farmers;
    const buyer = Array.isArray(booking.buyers) ? booking.buyers[0] : booking.buyers;

    return mainPlatformJson(200, {
      status: 200,
      data: {
        booking_ref: booking.id,
        farmer_id: farmer?.farmer_id ?? null,
        acres_booked: booking.acres_booked,
        price_per_acre: booking.price_per_acre,
        total_amount: booking.total_amount,
        payment_status: booking.payment_status,
        booking_status: booking.booking_status,
        source: booking.source,
        external_booking_ref: booking.external_booking_ref,
        payment_reference: booking.payment_reference,
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
      },
    });
  } catch (err) {
    console.error("main-platform-booking-status error:", err);
    return mainPlatformJson(500, { status: 500, code: "internal_error", message: "Internal server error" });
  }
});
