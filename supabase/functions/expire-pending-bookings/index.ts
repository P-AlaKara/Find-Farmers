import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const PAYMENT_TIMEOUT_MINUTES = 2;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const authorize = (req: Request) => {
  const expectedSecret = Deno.env.get("PAYMENT_EXPIRY_CRON_SECRET");
  const providedSecret = req.headers.get("x-cron-secret");
  return Boolean(expectedSecret && providedSecret && providedSecret === expectedSecret);
};

type ExpiredBooking = {
  id: string;
  payment_reference: string | null;
};

type ExpiredFarmer = {
  farmer_id: string | null;
} | null;

const failureCallbackPayload = (booking: ExpiredBooking, farmer: ExpiredFarmer) => ({
  status: "failed",
  reason: "payment_timeout",
  message: "Payment was not completed before the booking reservation expired.",
  data: {
    booking_ref: booking.id,
    payment_reference: booking.payment_reference,
    farmer_id: farmer?.farmer_id ?? null,
  },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { status: 405, message: "Method not allowed" });
  if (!authorize(req)) return json(401, { status: 401, message: "Unauthorized" });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const cutoff = new Date(Date.now() - PAYMENT_TIMEOUT_MINUTES * 60 * 1000).toISOString();

    const { data: bookings, error: lookupErr } = await supabase
      .from("bookings")
      .select("id, farmer_id, payment_reference, callback_url, farmers(farmer_id)")
      .eq("payment_status", "pending")
      .eq("booking_status", "pending_approval")
      .lt("created_at", cutoff);

    if (lookupErr) {
      console.error("Pending booking expiry lookup error:", lookupErr);
      return json(500, { status: 500, message: "Internal server error" });
    }

    let expired = 0;
    const callbackFailures: string[] = [];

    for (const booking of bookings || []) {
      const { data: updated, error: updateErr } = await supabase
        .from("bookings")
        .update({
          payment_status: "rejected",
          booking_status: "rejected",
          updated_at: new Date().toISOString(),
        })
        .eq("id", booking.id)
        .eq("payment_status", "pending")
        .eq("booking_status", "pending_approval")
        .select("id")
        .maybeSingle();

      if (updateErr) {
        console.error("Pending booking expiry update error:", updateErr, { booking_id: booking.id });
        continue;
      }
      if (!updated) continue;

      const { error: farmerErr } = await supabase
        .from("farmers")
        .update({ listing_status: "available" })
        .eq("id", booking.farmer_id)
        .eq("listing_status", "booked");
      if (farmerErr) {
        console.error("Pending booking expiry farmer release error:", farmerErr, { booking_id: booking.id });
      }

      expired += 1;

      if (booking.callback_url) {
        try {
          const res = await fetch(booking.callback_url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(failureCallbackPayload(booking, booking.farmers)),
          });
          if (!res.ok) callbackFailures.push(`${booking.id}:${res.status}`);
        } catch (err) {
          console.error("Pending booking expiry callback failed:", err, { booking_id: booking.id });
          callbackFailures.push(`${booking.id}:network_error`);
        }
      }
    }

    return json(200, {
      status: 200,
      data: {
        cutoff,
        expired,
        callback_failures: callbackFailures,
      },
    });
  } catch (err) {
    console.error("Pending booking expiry unexpected error:", err);
    return json(500, { status: 500, message: "Internal server error" });
  }
});
