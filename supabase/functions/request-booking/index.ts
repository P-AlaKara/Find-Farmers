import { createClient } from "npm:@supabase/supabase-js@2";
import { postMainPlatformCallback } from "../_shared/main-platform.ts";

const PRICE_PER_ACRE = 5000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const rollbackReservation = async (
  supabase: ReturnType<typeof createClient>,
  bookingId: string | null,
  farmerId: string | null,
) => {
  if (bookingId) await supabase.from("bookings").delete().eq("id", bookingId);
  if (farmerId) {
    await supabase
      .from("farmers")
      .update({ listing_status: "available" })
      .eq("id", farmerId)
      .eq("listing_status", "booked");
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let bookingId: string | null = null;
  let lockedFarmerId: string | null = null;

  try {
    const body = await req.json().catch(() => null);
    if (!body) return json({ ok: false, error: "Invalid JSON body", code: "invalid_request" }, 400);

    const farmerId = String(body.farmer_id || "").trim();
    const buyerId = String(body.buyer_id || "").trim();
    if (!farmerId || !buyerId) {
      return json({ ok: false, error: "Missing farmer_id or buyer_id", code: "missing_booking_context" }, 400);
    }

    const { data: buyer, error: buyerErr } = await supabase
      .from("buyers")
      .select("id, email, phone_number, account_status")
      .eq("id", buyerId)
      .maybeSingle();
    if (buyerErr) throw buyerErr;
    if (!buyer) return json({ ok: false, error: "Buyer not found", code: "buyer_not_found" }, 404);
    if (buyer.account_status && buyer.account_status !== "active") {
      return json({ ok: false, error: "Please complete your buyer account setup before booking.", code: "buyer_not_active" }, 409);
    }

    const { data: farmer, error: farmerErr } = await supabase
      .from("farmers")
      .select("id, farmer_id, registration_status, listing_status, acreage_planted, external_callback_url")
      .eq("id", farmerId)
      .maybeSingle();
    if (farmerErr) throw farmerErr;
    if (!farmer) return json({ ok: false, error: "Farmer not found", code: "farmer_not_found" }, 404);
    if (farmer.registration_status !== "approved" || farmer.listing_status !== "available") {
      return json({ ok: false, error: "This farm is no longer available for booking.", code: "farmer_unavailable" }, 409);
    }

    const acres = Number(farmer.acreage_planted);
    if (!Number.isFinite(acres) || acres <= 0) {
      return json({ ok: false, error: "Farmer listing has invalid acreage.", code: "invalid_farmer_acreage" }, 400);
    }

    const { data: booking, error: bookingErr } = await supabase
      .from("bookings")
      .insert({
        buyer_id: buyer.id,
        farmer_id: farmer.id,
        acres_booked: acres,
        price_per_acre: PRICE_PER_ACRE,
        payment_status: "pending",
        booking_status: "pending_approval",
        source: "local",
      })
      .select("id, total_amount")
      .single();
    if (bookingErr || !booking) throw bookingErr;
    bookingId = booking.id;

    const { data: lockedFarmer, error: lockErr } = await supabase
      .from("farmers")
      .update({ listing_status: "booked" })
      .eq("id", farmer.id)
      .eq("listing_status", "available")
      .select("id")
      .maybeSingle();
    if (lockErr) throw lockErr;
    if (!lockedFarmer) {
      await rollbackReservation(supabase, bookingId, null);
      return json({ ok: false, error: "Farmer is no longer available for booking.", code: "farmer_unavailable" }, 409);
    }
    lockedFarmerId = farmer.id;

    await postMainPlatformCallback(farmer.external_callback_url, {
      event: "booking_requested",
      data: {
        booking_ref: booking.id,
        farmer_id: farmer.farmer_id,
        booking_status: "pending_approval",
        payment_status: "pending",
        total_amount: booking.total_amount ?? acres * PRICE_PER_ACRE,
        farm_acreage: acres,
      },
    });

    return json({
      ok: true,
      status: 200,
      data: {
        booking_ref: booking.id,
        farmer_id: farmer.farmer_id,
        booking_status: "pending_approval",
        payment_status: "pending",
        total_amount: booking.total_amount ?? acres * PRICE_PER_ACRE,
        farm_acreage: acres,
        message: "Booking requested. The farmer will confirm availability before payment is requested.",
      },
    });
  } catch (err) {
    console.error("request-booking error:", err);
    await rollbackReservation(supabase, bookingId, lockedFarmerId);
    return json({ ok: false, error: "Internal server error", code: "internal_error" }, 500);
  }
});
