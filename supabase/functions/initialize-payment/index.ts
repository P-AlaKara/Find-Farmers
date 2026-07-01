import { createClient } from "npm:@supabase/supabase-js@2";
import { postMainPlatformCallback } from "../_shared/main-platform.ts";

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

const maskEmail = (email?: string | null) => {
  if (!email) return null;
  const [name, domain] = email.split("@");
  if (!domain) return "***";
  return `${name.slice(0, 2)}***@${domain}`;
};

const formatMpesaPhone = (phone: string) => {
  const digits = String(phone || "").replace(/\D/g, "");
  let local = "";

  if (digits.startsWith("254")) local = digits.slice(3);
  else if (digits.startsWith("0")) local = digits.slice(1);
  else if (digits.length === 9) local = digits;

  if (!/^(7|1)\d{8}$/.test(local)) return null;
  return `+254${local}`;
};

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();

  if (req.method === "OPTIONS") return new Response("ok", { headers: { ...corsHeaders, "x-request-id": requestId } });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed", request_id: requestId }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const fail = (error: string, code: string, status = 400, details?: Record<string, unknown>) =>
    json({ ok: false, error, code, request_id: requestId, details }, status);

  try {
    const body = await req.json().catch(() => null);
    if (!body) return fail("We could not start this payment. Please refresh and try again.", "invalid_request");

    const buyerId = String(body.buyer_id || "").trim();
    const bookingId = String(body.booking_id || "").trim();
    if (!buyerId || !bookingId) return fail("Missing buyer_id or booking_id.", "missing_payment_context");

    const { data: booking, error: bookingErr } = await supabase
      .from("bookings")
      .select(`
        id,
        buyer_id,
        farmer_id,
        acres_booked,
        price_per_acre,
        total_amount,
        payment_reference,
        payment_status,
        booking_status,
        source,
        buyers(id, buyer_name, phone_number, email, county, account_status),
        farmers(id, farmer_id, full_name, external_callback_url)
      `)
      .eq("id", bookingId)
      .maybeSingle();

    if (bookingErr) throw bookingErr;
    if (!booking) return fail("Booking not found.", "booking_not_found", 404);
    if (booking.buyer_id !== buyerId) return fail("This booking does not belong to this buyer.", "unauthorized_booking", 403);
    if (booking.payment_status === "paid" || booking.booking_status === "confirmed") {
      return fail("This booking has already been paid.", "booking_already_paid", 409);
    }
    if (booking.payment_status === "rejected" || booking.booking_status === "rejected") {
      return fail("This booking is no longer available for payment.", "booking_rejected", 409);
    }
    if (booking.booking_status !== "approved") {
      return fail("The farmer has not confirmed this booking yet.", "booking_not_approved", 409);
    }

    const buyer = Array.isArray(booking.buyers) ? booking.buyers[0] : booking.buyers;
    const farmer = Array.isArray(booking.farmers) ? booking.farmers[0] : booking.farmers;
    if (!buyer) return fail("Buyer not found.", "buyer_not_found", 404);
    if (buyer.account_status && buyer.account_status !== "active") {
      return fail("Please complete your buyer account setup before payment.", "buyer_not_active", 409);
    }
    if (!buyer.email || !buyer.phone_number) {
      return fail("Please complete your buyer profile with an email and phone number before payment.", "buyer_contact_missing");
    }

    const formattedPhone = formatMpesaPhone(buyer.phone_number);
    if (!formattedPhone) {
      return fail(
        "Please update your buyer profile with a valid Kenyan M-Pesa phone number, for example 07XXXXXXXX or +2547XXXXXXXX.",
        "invalid_mpesa_phone",
      );
    }

    const paystackKey = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!paystackKey) return fail("Payments are not configured yet. Please contact support.", "payment_provider_not_configured", 500);

    const paymentReference = booking.payment_reference || booking.id.replace(/-/g, "");
    if (!booking.payment_reference) {
      const { error: refErr } = await supabase
        .from("bookings")
        .update({ payment_reference: paymentReference })
        .eq("id", booking.id)
        .is("payment_reference", null);
      if (refErr) throw refErr;
    }

    const totalAmount = Number(booking.total_amount ?? Number(booking.acres_booked) * Number(booking.price_per_acre));
    const psRes = await fetch("https://api.paystack.co/charge", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paystackKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: buyer.email,
        amount: Math.round(totalAmount * 100),
        currency: "KES",
        mobile_money: {
          phone: formattedPhone,
          provider: "mpesa",
        },
        reference: paymentReference,
        metadata: {
          booking_id: booking.id,
          farmer_id: booking.farmer_id,
          public_farmer_id: farmer?.farmer_id ?? null,
          buyer_id: buyer.id,
          buyer_name: buyer.buyer_name,
          buyer_county: buyer.county,
          source: booking.source || "local",
        },
      }),
    });

    const psJson = await psRes.json().catch(() => ({}));
    if (!psRes.ok || !psJson?.status) {
      console.error("Paystack charge error:", {
        status: psRes.status,
        message: psJson?.message,
        booking_id: booking.id,
        reference: paymentReference,
        email: maskEmail(buyer.email),
      });
      return fail(
        psJson?.message || "M-Pesa could not start the payment. Please confirm your phone number and try again.",
        "paystack_charge_failed",
        502,
        { paystack_status: psRes.status },
      );
    }

    const requestedAt = new Date().toISOString();
    const { error: updateErr } = await supabase
      .from("bookings")
      .update({ payment_requested_at: requestedAt, payment_reference: paymentReference })
      .eq("id", booking.id);
    if (updateErr) throw updateErr;

    await postMainPlatformCallback(farmer?.external_callback_url, {
      event: "payment_started",
      data: {
        booking_ref: booking.id,
        farmer_id: farmer?.farmer_id ?? null,
        payment_reference: paymentReference,
        booking_status: "approved",
        payment_status: "pending",
        total_amount: totalAmount,
        payment_requested_at: requestedAt,
      },
    });

    return json({
      ok: true,
      status: 200,
      request_id: requestId,
      data: {
        booking_ref: booking.id,
        reference: paymentReference,
        payment_reference: paymentReference,
        message: `An M-Pesa payment prompt has been sent to ${formattedPhone}. Please enter your PIN to complete the booking.`,
      },
    });
  } catch (err) {
    console.error("initialize-payment error:", err);
    return fail("We could not start this payment right now. Please try again in a moment.", "internal_error", 500);
  }
});
