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

const formatMpesaPhone = (phone: string) => {
  const cleaned = String(phone || "").replace(/[\s\-()]/g, "");
  if (cleaned.startsWith("+254")) return cleaned.slice(1);
  if (cleaned.startsWith("0")) return `254${cleaned.slice(1)}`;
  return cleaned;
};

const rollbackReservation = async (
  supabase: ReturnType<typeof createClient>,
  bookingId: string | null,
  farmerId: string | null,
) => {
  if (bookingId) await supabase.from("bookings").delete().eq("id", bookingId);
  if (farmerId) await supabase.from("farmers").update({ listing_status: "available" }).eq("id", farmerId);
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let bookingId: string | null = null;
  let lockedFarmerId: string | null = null;

  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const body = await req.json().catch(() => null);
    if (!body) return json({ error: "Invalid JSON body" }, 400);

    const farmerId = String(body.farmer_id || "").trim();
    const buyerId = String(body.buyer_id || "").trim();
    if (!farmerId || !buyerId) return json({ error: "Missing farmer_id or buyer_id" }, 400);

    const { data: buyer, error: buyerErr } = await supabase
      .from("buyers")
      .select("id, buyer_name, phone_number, email, county, account_status")
      .eq("id", buyerId)
      .maybeSingle();
    if (buyerErr) throw buyerErr;
    if (!buyer) return json({ error: "Buyer not found" }, 404);
    if (buyer.account_status && buyer.account_status !== "active") {
      return json({ error: "Please complete your buyer account setup before booking." }, 403);
    }
    if (!buyer.email || !buyer.phone_number) return json({ error: "Buyer email and phone number are required for payment." }, 400);

    const { data: farmer, error: farmerErr } = await supabase
      .from("farmers")
      .select("id, registration_status, listing_status, acreage_planted")
      .eq("id", farmerId)
      .maybeSingle();
    if (farmerErr) throw farmerErr;
    if (!farmer) return json({ error: "Farmer not found" }, 404);
    if (farmer.registration_status !== "approved" || farmer.listing_status !== "available") {
      return json({ error: "Farmer is not available for booking" }, 400);
    }

    const acres = Number(farmer.acreage_planted);
    if (!Number.isFinite(acres) || acres <= 0) return json({ error: "Invalid farmer acreage" }, 400);

    const totalAmount = acres * PRICE_PER_ACRE;
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
    if (bookingErr) throw bookingErr;
    bookingId = booking.id;

    const paymentReference = booking.id.replace(/-/g, "");
    const { error: refErr } = await supabase
      .from("bookings")
      .update({ payment_reference: paymentReference })
      .eq("id", booking.id);
    if (refErr) throw refErr;

    const { error: lockErr } = await supabase
      .from("farmers")
      .update({ listing_status: "booked" })
      .eq("id", farmer.id)
      .eq("listing_status", "available");
    if (lockErr) throw lockErr;
    lockedFarmerId = farmer.id;

    const paystackKey = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!paystackKey) {
      await rollbackReservation(supabase, bookingId, lockedFarmerId);
      return json({ error: "Payment provider not configured" }, 500);
    }

    const formattedPhone = formatMpesaPhone(buyer.phone_number);
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
    if (!psRes.ok || !psJson?.status) {
      await rollbackReservation(supabase, bookingId, lockedFarmerId);
      return json(
        { error: psJson?.message || "Failed to initialize M-Pesa charge", paystack_status: psRes.status },
        500,
      );
    }

    return json({
      status: 200,
      data: {
        booking_ref: booking.id,
        reference: paymentReference,
        message: `An M-Pesa payment prompt has been sent to ${formattedPhone}. Please enter your PIN to complete the booking.`,
      },
    });
  } catch (err) {
    console.error("initialize-payment error:", err);
    await rollbackReservation(supabase, bookingId, lockedFarmerId);
    return json({ error: (err as Error).message || "Internal error" }, 500);
  }
});
