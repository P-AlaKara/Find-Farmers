import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const PAYMENT_TIMEOUT_MINUTES = 2;

const failureCallbackPayload = (booking: {
  id: string;
  payment_reference: string | null;
  farmers?: { farmer_id: string | null } | null;
}) => ({
  status: "failed",
  reason: "payment_timeout",
  message: "Payment was not completed before the booking reservation expired.",
  data: {
    booking_ref: booking.id,
    payment_reference: booking.payment_reference,
    farmer_id: booking.farmers?.farmer_id ?? null,
  },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "GET") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const reference = url.pathname.split("/").pop() || url.searchParams.get("reference") || "";

    if (!reference) {
      return new Response(JSON.stringify({ error: "Reference is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: booking, error } = await supabase
      .from("bookings")
      .select("id, farmer_id, payment_reference, payment_status, booking_status, created_at, callback_url, farmers(farmer_id)")
      .eq("payment_reference", reference)
      .maybeSingle();

    if (error) throw error;
    if (!booking) {
      return new Response(JSON.stringify({ error: "Booking not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (
      booking.payment_status === "pending" &&
      booking.booking_status === "pending_approval" &&
      Date.now() - new Date(booking.created_at).getTime() >= PAYMENT_TIMEOUT_MINUTES * 60 * 1000
    ) {
      const { data: expiredBooking, error: expireErr } = await supabase
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

      if (expireErr) throw expireErr;

      if (expiredBooking) {
        const { error: releaseErr } = await supabase
          .from("farmers")
          .update({ listing_status: "available" })
          .eq("id", booking.farmer_id)
          .eq("listing_status", "booked");
        if (releaseErr) throw releaseErr;

        if (booking.callback_url) {
          try {
            const callbackRes = await fetch(booking.callback_url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(failureCallbackPayload(booking)),
            });
            if (!callbackRes.ok) {
              console.error("Payment timeout callback non-OK:", callbackRes.status, await callbackRes.text());
            }
          } catch (callbackErr) {
            console.error("Payment timeout callback failed:", callbackErr);
          }
        }
      }

      return new Response(
        JSON.stringify({
          status: 200,
          data: {
            booking_ref: booking.id,
            payment_status: "rejected",
            booking_status: "rejected",
            reason: "payment_timeout",
          },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        status: 200,
        data: {
          booking_ref: booking.id,
          payment_status: booking.payment_status,
          booking_status: booking.booking_status,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("booking-status error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
