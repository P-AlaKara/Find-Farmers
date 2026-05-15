import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

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

    let event: any;
    try { event = JSON.parse(rawBody); } catch {
      return json(400, { status: 400, message: "Invalid JSON" });
    }

    if (event?.event !== "charge.success") {
      return json(200, { status: 200, message: "Event ignored" });
    }

    const reference = event?.data?.reference;
    if (!reference) return json(400, { status: 400, message: "Missing reference" });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: booking, error: bookingErr } = await supabase
      .from("bookings")
      .select("id, farmer_id, buyer_id, acres_booked, total_amount, payment_status, callback_url")
      .eq("id", reference)
      .maybeSingle();

    if (bookingErr) {
      console.error("Booking lookup error:", bookingErr);
      return json(500, { status: 500, message: "Internal server error" });
    }
    if (!booking) return json(404, { status: 404, message: "Booking not found" });

    if (booking.payment_status === "paid") {
      return json(200, { status: 200, message: "Already processed" });
    }

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

    const [{ data: farmer }, { data: buyer }] = await Promise.all([
      supabase.from("farmers").select("id, farmer_id, full_name").eq("id", booking.farmer_id).maybeSingle(),
      supabase.from("buyers").select("id").eq("id", booking.buyer_id).maybeSingle(),
    ]);

    if (booking.callback_url) {
      try {
        const res = await fetch(booking.callback_url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: 200,
            message: "Booking confirmed",
            data: {
              booking_ref: booking.id,
              farmer_id: farmer?.farmer_id ?? farmer?.id ?? booking.farmer_id,
              farmer_name: farmer?.full_name ?? null,
              buyer_id: buyer?.id ?? booking.buyer_id,
              acres_booked: booking.acres_booked,
              total_amount: booking.total_amount,
            },
          }),
        });
        if (!res.ok) {
          console.error("Callback URL non-OK:", res.status, await res.text());
        }
      } catch (cbErr) {
        console.error("Callback POST failed:", cbErr);
      }
    }

    return json(200, { status: 200, message: "Booking confirmed" });
  } catch (err) {
    console.error("Webhook unexpected error:", err);
    return json(500, { status: 500, message: "Internal server error" });
  }
});
