import { createClient } from "npm:@supabase/supabase-js@2";
import {
  authorizeMainPlatform,
  mainPlatformCorsHeaders,
  mainPlatformJson,
  postMainPlatformCallback,
  validateMainPlatformBookingDecision,
} from "../_shared/main-platform.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: mainPlatformCorsHeaders });
  if (req.method !== "POST") return mainPlatformJson(405, { status: 405, code: "method_not_allowed", message: "Method not allowed" });
  if (!authorizeMainPlatform(req)) return mainPlatformJson(401, { status: 401, code: "unauthorized", message: "Unauthorized" });

  try {
    const body = await req.json().catch(() => null);
    if (!body) return mainPlatformJson(400, { status: 400, code: "invalid_json", message: "Invalid JSON body" });
    const validated = validateMainPlatformBookingDecision(body);
    if (!validated.ok) return mainPlatformJson(validated.status, { status: validated.status, code: "invalid_request", message: validated.message });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: farmer, error: farmerErr } = await supabase
      .from("farmers")
      .select("id, farmer_id, external_callback_url")
      .eq("farmer_id", validated.data.farmer_id)
      .maybeSingle();
    if (farmerErr) throw farmerErr;
    if (!farmer) return mainPlatformJson(404, { status: 404, code: "farmer_not_found", message: "Farmer not found" });

    const { data: booking, error: fetchErr } = await supabase
      .from("bookings")
      .select("id, farmer_id, payment_status, booking_status, total_amount")
      .eq("id", validated.data.booking_ref)
      .eq("farmer_id", farmer.id)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!booking) return mainPlatformJson(404, { status: 404, code: "booking_not_found", message: "Booking not found" });

    if (booking.booking_status === "approved" && validated.data.decision === "approve") {
      return mainPlatformJson(200, {
        status: 200,
        data: {
          booking_ref: booking.id,
          farmer_id: farmer.farmer_id,
          booking_status: booking.booking_status,
          payment_status: booking.payment_status,
          message: "Booking was already confirmed by the farmer. Buyer payment is pending.",
        },
      });
    }

    if (booking.booking_status !== "pending_approval") {
      return mainPlatformJson(409, {
        status: 409,
        code: "invalid_booking_state",
        message: "Only pending farmer confirmation bookings can be updated",
        data: {
          booking_ref: booking.id,
          booking_status: booking.booking_status,
          payment_status: booking.payment_status,
        },
      });
    }

    if (validated.data.decision === "approve") {
      const confirmedAt = new Date().toISOString();
      const { data: updated, error } = await supabase
        .from("bookings")
        .update({ booking_status: "approved", farmer_confirmed_at: confirmedAt })
        .eq("id", booking.id)
        .eq("booking_status", "pending_approval")
        .select("id, payment_status, booking_status, total_amount, farmer_confirmed_at")
        .single();
      if (error) throw error;

      await postMainPlatformCallback(farmer.external_callback_url, {
        event: "farmer_confirmed",
        data: {
          booking_ref: updated.id,
          farmer_id: farmer.farmer_id,
          booking_status: updated.booking_status,
          payment_status: updated.payment_status,
          total_amount: updated.total_amount,
          farmer_confirmed_at: updated.farmer_confirmed_at,
        },
      });

      return mainPlatformJson(200, {
        status: 200,
        data: {
          booking_ref: updated.id,
          farmer_id: farmer.farmer_id,
          booking_status: updated.booking_status,
          payment_status: updated.payment_status,
          farmer_confirmed_at: updated.farmer_confirmed_at,
          message: "Farmer availability confirmed. Buyer can now confirm and pay.",
        },
      });
    }

    const { data: updated, error } = await supabase
      .from("bookings")
      .update({ booking_status: "rejected", payment_status: "rejected" })
      .eq("id", booking.id)
      .eq("booking_status", "pending_approval")
      .select("id, payment_status, booking_status")
      .single();
    if (error) throw error;

    const { error: releaseErr } = await supabase
      .from("farmers")
      .update({ listing_status: "available" })
      .eq("id", farmer.id)
      .eq("listing_status", "booked");
    if (releaseErr) throw releaseErr;

    await postMainPlatformCallback(farmer.external_callback_url, {
      event: "farmer_rejected",
      data: {
        booking_ref: updated.id,
        farmer_id: farmer.farmer_id,
        booking_status: updated.booking_status,
        payment_status: updated.payment_status,
      },
    });

    return mainPlatformJson(200, {
      status: 200,
      data: {
        booking_ref: updated.id,
        farmer_id: farmer.farmer_id,
        booking_status: updated.booking_status,
        payment_status: updated.payment_status,
        message: "Booking rejected and farmer listing released.",
      },
    });
  } catch (err) {
    console.error("main-platform-confirm-booking error:", err);
    return mainPlatformJson(500, { status: 500, code: "internal_error", message: "Internal server error" });
  }
});
