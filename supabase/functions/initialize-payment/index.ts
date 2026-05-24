import { createClient } from "npm:@supabase/supabase-js@2";

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

const log = (requestId: string, message: string, data?: Record<string, unknown>) => {
  console.log(JSON.stringify({
    request_id: requestId,
    function: "initialize-payment",
    message,
    ...(data || {}),
  }));
};

const logError = (requestId: string, message: string, err?: unknown, data?: Record<string, unknown>) => {
  const error = err instanceof Error
    ? { name: err.name, message: err.message, stack: err.stack }
    : err;
  console.error(JSON.stringify({
    request_id: requestId,
    function: "initialize-payment",
    message,
    error,
    ...(data || {}),
  }));
};

const maskEmail = (email?: string | null) => {
  if (!email) return null;
  const [name, domain] = email.split("@");
  if (!domain) return "***";
  return `${name.slice(0, 2)}***@${domain}`;
};

const maskPhone = (phone?: string | null) => {
  if (!phone) return null;
  const cleaned = String(phone).replace(/\D/g, "");
  if (cleaned.length <= 4) return "****";
  return `${cleaned.slice(0, 3)}***${cleaned.slice(-3)}`;
};

const summarizePaystack = (payload: Record<string, unknown>) => ({
  status: payload?.status,
  message: payload?.message,
  gateway_response: (payload?.data as Record<string, unknown> | undefined)?.gateway_response,
  reference: (payload?.data as Record<string, unknown> | undefined)?.reference,
});

const formatMpesaPhone = (phone: string) => {
  const raw = String(phone || "").trim();
  const digits = raw.replace(/\D/g, "");
  let local = "";

  if (digits.startsWith("254")) local = digits.slice(3);
  else if (digits.startsWith("0")) local = digits.slice(1);
  else if (digits.length === 9) local = digits;

  if (!/^(7|1)\d{8}$/.test(local)) return null;
  return `+254${local}`;
};

const rollbackReservation = async (
  supabase: ReturnType<typeof createClient>,
  bookingId: string | null,
  farmerId: string | null,
  requestId: string,
) => {
  if (!bookingId && !farmerId) {
    log(requestId, "Rollback skipped; no booking or farmer lock to clean up");
    return;
  }

  log(requestId, "Rolling back tentative reservation", { booking_id: bookingId, farmer_id: farmerId });
  if (bookingId) {
    const { error } = await supabase.from("bookings").delete().eq("id", bookingId);
    if (error) logError(requestId, "Rollback booking delete failed", error, { booking_id: bookingId });
    else log(requestId, "Rollback booking delete succeeded", { booking_id: bookingId });
  }
  if (farmerId) {
    const { error } = await supabase.from("farmers").update({ listing_status: "available" }).eq("id", farmerId);
    if (error) logError(requestId, "Rollback farmer unlock failed", error, { farmer_id: farmerId });
    else log(requestId, "Rollback farmer unlock succeeded", { farmer_id: farmerId });
  }
};

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();

  if (req.method === "OPTIONS") {
    log(requestId, "CORS preflight handled", {
      origin: req.headers.get("origin"),
      method: req.method,
    });
    return new Response("ok", { headers: { ...corsHeaders, "x-request-id": requestId } });
  }

  const fail = async (
    error: string,
    code = "payment_initialization_failed",
    details?: Record<string, unknown>,
    rollback?: { supabase: ReturnType<typeof createClient>; bookingId: string | null; farmerId: string | null },
  ) => {
    if (rollback) await rollbackReservation(rollback.supabase, rollback.bookingId, rollback.farmerId, requestId);
    log(requestId, "Returning payment initialization failure", {
      code,
      user_message: error,
      details,
      duration_ms: Date.now() - startedAt,
    });
    return json({ ok: false, error, code, request_id: requestId, details });
  };

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let bookingId: string | null = null;
  let lockedFarmerId: string | null = null;

  try {
    log(requestId, "Request received", {
      method: req.method,
      origin: req.headers.get("origin"),
      user_agent: req.headers.get("user-agent"),
      has_apikey_header: Boolean(req.headers.get("apikey")),
      has_authorization_header: Boolean(req.headers.get("authorization")),
      supabase_url_configured: Boolean(Deno.env.get("SUPABASE_URL")),
      service_role_configured: Boolean(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")),
      paystack_configured: Boolean(Deno.env.get("PAYSTACK_SECRET_KEY")),
    });

    if (req.method !== "POST") return json({ ok: false, error: "Method not allowed", request_id: requestId }, 405);

    const body = await req.json().catch(() => null);
    if (!body) return fail("We could not start this payment. Please refresh and try again.", "invalid_request");

    const farmerId = String(body.farmer_id || "").trim();
    const buyerId = String(body.buyer_id || "").trim();
    log(requestId, "Parsed request body", {
      farmer_id: farmerId || null,
      buyer_id: buyerId || null,
      received_keys: Object.keys(body || {}),
    });

    if (!farmerId || !buyerId) return fail("We could not identify this booking. Please refresh and try again.", "missing_booking_context");

    log(requestId, "Looking up buyer", { buyer_id: buyerId });
    const { data: buyer, error: buyerErr } = await supabase
      .from("buyers")
      .select("id, buyer_name, phone_number, email, county, account_status")
      .eq("id", buyerId)
      .maybeSingle();
    if (buyerErr) {
      logError(requestId, "Buyer lookup failed", buyerErr, { buyer_id: buyerId });
      throw buyerErr;
    }
    if (!buyer) return fail("Please sign in again before booking this farm.", "buyer_not_found");
    log(requestId, "Buyer lookup succeeded", {
      buyer_id: buyer.id,
      account_status: buyer.account_status,
      email: maskEmail(buyer.email),
      phone: maskPhone(buyer.phone_number),
      county: buyer.county,
    });

    if (buyer.account_status && buyer.account_status !== "active") {
      return fail("Please complete your buyer account setup before booking.", "buyer_not_active");
    }
    if (!buyer.email || !buyer.phone_number) return fail("Please complete your buyer profile with an email and phone number before booking.", "buyer_contact_missing");

    log(requestId, "Looking up farmer", { farmer_id: farmerId });
    const { data: farmer, error: farmerErr } = await supabase
      .from("farmers")
      .select("id, registration_status, listing_status, acreage_planted")
      .eq("id", farmerId)
      .maybeSingle();
    if (farmerErr) {
      logError(requestId, "Farmer lookup failed", farmerErr, { farmer_id: farmerId });
      throw farmerErr;
    }
    if (!farmer) return fail("This farm listing could not be found. Please refresh the marketplace.", "farmer_not_found");
    log(requestId, "Farmer lookup succeeded", {
      farmer_id: farmer.id,
      registration_status: farmer.registration_status,
      listing_status: farmer.listing_status,
      acreage_planted: farmer.acreage_planted,
    });

    if (farmer.registration_status !== "approved" || farmer.listing_status !== "available") {
      return fail("This farm is no longer available for booking.", "farmer_unavailable");
    }

    const acres = Number(farmer.acreage_planted);
    if (!Number.isFinite(acres) || acres <= 0) return fail("This farm listing has invalid acreage. Please contact support.", "invalid_farmer_acreage");

    const totalAmount = acres * PRICE_PER_ACRE;
    log(requestId, "Creating pending booking", {
      buyer_id: buyer.id,
      farmer_id: farmer.id,
      acres,
      price_per_acre: PRICE_PER_ACRE,
      total_amount: totalAmount,
    });

    const { data: booking, error: bookingErr } = await supabase
      .from("bookings")
      .insert({
        buyer_id: buyer.id,
        farmer_id: farmer.id,
        acres_booked: acres,
        price_per_acre: PRICE_PER_ACRE,
        payment_status: "pending",
        booking_status: "pending_approval",
      })
      .select("id")
      .single();
    if (bookingErr) {
      logError(requestId, "Booking insert failed", bookingErr, { buyer_id: buyer.id, farmer_id: farmer.id });
      throw bookingErr;
    }
    bookingId = booking.id;
    log(requestId, "Pending booking created", { booking_id: booking.id });

    const paymentReference = booking.id.replace(/-/g, "");
    log(requestId, "Saving payment reference", {
      booking_id: booking.id,
      payment_reference: paymentReference,
    });
    const { error: refErr } = await supabase
      .from("bookings")
      .update({ payment_reference: paymentReference })
      .eq("id", booking.id);
    if (refErr) {
      logError(requestId, "Payment reference update failed", refErr, { booking_id: booking.id, payment_reference: paymentReference });
      throw refErr;
    }

    log(requestId, "Locking farmer listing", { farmer_id: farmer.id });
    const { error: lockErr } = await supabase
      .from("farmers")
      .update({ listing_status: "booked" })
      .eq("id", farmer.id)
      .eq("listing_status", "available");
    if (lockErr) {
      logError(requestId, "Farmer lock failed", lockErr, { farmer_id: farmer.id });
      throw lockErr;
    }
    lockedFarmerId = farmer.id;
    log(requestId, "Farmer listing locked", { farmer_id: farmer.id });

    const paystackKey = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!paystackKey) {
      return fail(
        "Payments are not configured yet. Please contact support.",
        "payment_provider_not_configured",
        undefined,
        { supabase, bookingId, farmerId: lockedFarmerId },
      );
    }

    const formattedPhone = formatMpesaPhone(buyer.phone_number);
    if (!formattedPhone) {
      return fail(
        "Please update your buyer profile with a valid Kenyan M-Pesa phone number, for example 07XXXXXXXX or +2547XXXXXXXX.",
        "invalid_mpesa_phone",
      );
    }

    log(requestId, "Calling Paystack charge endpoint", {
      booking_id: booking.id,
      reference: paymentReference,
      email: maskEmail(buyer.email),
      phone: maskPhone(formattedPhone),
      amount_minor_units: Math.round(totalAmount * 100),
      currency: "KES",
      provider: "mpesa",
    });

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
          farmer_id: farmer.id,
          buyer_id: buyer.id,
          buyer_name: buyer.buyer_name,
          buyer_county: buyer.county,
        },
      }),
    });

    const psJson = await psRes.json().catch(() => ({}));
    log(requestId, "Paystack response received", {
      http_status: psRes.status,
      ok: psRes.ok,
      paystack: summarizePaystack(psJson as Record<string, unknown>),
    });

    if (!psRes.ok || !psJson?.status) {
      return fail(
        psJson?.message || "M-Pesa could not start the payment. Please confirm your phone number and try again.",
        "paystack_charge_failed",
        { paystack_status: psRes.status, paystack_response: psJson },
        { supabase, bookingId, farmerId: lockedFarmerId },
      );
    }

    log(requestId, "Payment initialization succeeded", {
      booking_id: booking.id,
      reference: paymentReference,
      duration_ms: Date.now() - startedAt,
    });

    return json({
      ok: true,
      status: 200,
      request_id: requestId,
      data: {
        booking_ref: booking.id,
        reference: paymentReference,
        message: `An M-Pesa payment prompt has been sent to ${formattedPhone}. Please enter your PIN to complete the booking.`,
      },
    });
  } catch (err) {
    logError(requestId, "Unhandled initialize-payment error", err, {
      booking_id: bookingId,
      locked_farmer_id: lockedFarmerId,
      duration_ms: Date.now() - startedAt,
    });
    return fail(
      "We could not start this payment right now. Please try again in a moment.",
      "internal_error",
      undefined,
      { supabase, bookingId, farmerId: lockedFarmerId },
    );
  }
});
