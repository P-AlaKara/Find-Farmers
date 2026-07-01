import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-paystack-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function hmacSha512Hex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

type BookingCallbackRow = {
  id: string;
  acres_booked: number | null;
  price_per_acre: number | null;
  total_amount: number | null;
};

type FarmerCallbackRow = {
  farmer_id: string | null;
  full_name: string | null;
  phone_number: string | null;
  email: string | null;
  county: string | null;
  ward: string | null;
  specific_location: string | null;
  potato_variety: string | null;
  acreage_planted: number | null;
  planting_date: string | null;
} | null;

type BuyerCallbackRow = {
  buyer_name: string | null;
  company_name: string | null;
  phone_number: string | null;
  email: string | null;
  county: string | null;
} | null;

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

const buildSuccessCallback = (
  booking: BookingCallbackRow,
  farmer: FarmerCallbackRow,
  buyer: BuyerCallbackRow,
  reference: string,
) => ({
  status: "success",
  message: "Booking confirmed",
  data: {
    booking_ref: booking.id,
    payment_reference: reference,
    payment_status: "paid",
    booking_status: "confirmed",
    total_amount: booking.total_amount,
    price_per_acre: booking.price_per_acre,
    farm_acreage: booking.acres_booked,
    buyer: {
      company_name: buyer?.company_name ?? buyer?.buyer_name ?? null,
      phone: buyer?.phone_number ?? null,
      email: buyer?.email ?? null,
      county: buyer?.county ?? null,
    },
    farmer: {
      farmer_id: farmer?.farmer_id ?? null,
      full_name: farmer?.full_name ?? null,
      phone_number: farmer?.phone_number ?? null,
      email: farmer?.email ?? null,
      county: farmer?.county ?? null,
      ward: farmer?.ward ?? null,
      specific_location: farmer?.specific_location ?? null,
      potato_variety: farmer?.potato_variety ?? null,
      acreage_planted: farmer?.acreage_planted ?? null,
      planting_date: farmer?.planting_date ?? null,
    },
  },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") return json(405, { status: 405, message: "Method not allowed" });

    const paystackKey = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!paystackKey) {
      console.error("PAYSTACK_SECRET_KEY not configured");
      return json(500, { status: 500, message: "Server misconfigured" });
    }

    const rawBody = await req.text();
    const signature = req.headers.get("x-paystack-signature") ?? "";
    const expected = await hmacSha512Hex(paystackKey, rawBody);
    if (!signature || !timingSafeEqual(signature, expected)) {
      console.warn("Invalid Paystack signature");
      return json(401, { status: 401, message: "Invalid signature" });
    }

    let event: unknown;
    try {
      event = JSON.parse(rawBody);
    } catch (err) {
      console.error("Invalid Paystack webhook JSON:", err);
      return json(400, { status: 400, message: "Invalid JSON" });
    }
    const eventRecord = event as Record<string, unknown>;

    if (eventRecord?.event !== "charge.success") {
      return json(200, { status: 200, message: "Event ignored" });
    }

    const data = eventRecord.data as Record<string, unknown> | undefined;
    const reference = typeof data?.reference === "string" ? data.reference : "";
    if (!reference) return json(400, { status: 400, message: "Missing reference" });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: booking, error: bookingErr } = await supabase
      .from("bookings")
      .select("id, farmer_id, buyer_id, acres_booked, price_per_acre, total_amount, payment_status, booking_status, callback_url")
      .eq("payment_reference", reference)
      .maybeSingle();

    if (bookingErr) {
      console.error("Booking lookup error:", bookingErr);
      return json(500, { status: 500, message: "Internal server error" });
    }
    if (!booking) return json(404, { status: 404, message: "Booking not found" });

    if (booking.payment_status === "rejected" || booking.booking_status === "rejected") {
      console.warn("Ignoring successful payment webhook for expired external booking", {
        booking_id: booking.id,
        reference,
      });
      return json(200, { status: 200, message: "Booking already expired" });
    }

    const [{ data: farmer }, { data: buyer }] = await Promise.all([
      supabase
        .from("farmers")
        .select("id, farmer_id, full_name, phone_number, email, county, ward, specific_location, potato_variety, acreage_planted, planting_date")
        .eq("id", booking.farmer_id)
        .maybeSingle(),
      supabase
        .from("buyers")
        .select("id, buyer_name, company_name, phone_number, email, county")
        .eq("id", booking.buyer_id)
        .maybeSingle(),
    ]);

    if (booking.payment_status !== "paid") {
      const { error: updateErr } = await supabase
        .from("bookings")
        .update({
          payment_status: "paid",
          booking_status: "confirmed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", booking.id);
      if (updateErr) {
        console.error("Booking update error:", updateErr);
        return json(500, { status: 500, message: "Failed to update booking" });
      }
    }

    if (booking.callback_url) {
      try {
        const res = await fetch(booking.callback_url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildSuccessCallback(booking, farmer, buyer, reference)),
        });
        if (!res.ok) {
          console.error("Callback URL non-OK:", res.status, await res.text());
        }
      } catch (cbErr) {
        console.error("Callback POST failed:", cbErr);
      }
    }

    return json(200, {
      status: 200,
      message: booking.payment_status === "paid" ? "Already processed" : "Booking confirmed",
    });
  } catch (err) {
    console.error("Webhook unexpected error:", err);
    return json(500, { status: 500, message: "Internal server error" });
  }
});
