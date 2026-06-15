import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createHmac, timingSafeEqual } from "node:crypto";
import { sendEmail } from "../_shared/resend.js";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-paystack-signature") || "";
    const secret = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!secret) {
      return new Response(JSON.stringify({ error: "Server misconfigured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const expected = createHmac("sha512", secret).update(rawBody).digest("hex");
    let valid = false;
    try {
      const a = Buffer.from(expected, "hex");
      const b = Buffer.from(signature, "hex");
      valid = a.length === b.length && timingSafeEqual(a, b);
    } catch {
      valid = false;
    }

    if (!valid) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const event = JSON.parse(rawBody);
    if (event?.event !== "charge.success") {
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const reference = event?.data?.reference;
    if (!reference) {
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: booking, error: lookupErr } = await supabase
      .from("bookings")
      .select("id, payment_status, booking_status, acres_booked, total_amount, farmer_id, buyer_id, buyers(buyer_name,email,phone_number,county), farmers(full_name,email)")
      .eq("payment_reference", reference)
      .maybeSingle();

    if (lookupErr) throw lookupErr;
    if (!booking) {
      return new Response(JSON.stringify({ error: "Booking not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (booking.payment_status === "paid") {
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (booking.payment_status === "rejected" || booking.booking_status === "rejected") {
      console.warn("Ignoring successful payment webhook for expired booking", { booking_id: booking.id, reference });
      return new Response(JSON.stringify({ received: true, ignored: "booking_expired" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: updErr } = await supabase
      .from("bookings")
      .update({
        payment_status: "paid",
        booking_status: "confirmed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", booking.id);
    if (updErr) throw updErr;

    const buyerName = booking.buyers?.buyer_name || "Customer";
    const farmerName = booking.farmers?.full_name || "Farmer";
    const amountFormatted = `KES ${Number(booking.total_amount || 0).toLocaleString()}`;
    const buyerHtml = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e5e7eb;">
        <div style="background:#166534;color:#fff;padding:16px;font-size:20px;font-weight:700;">PotatoMarket Kenya</div>
        <div style="padding:20px;color:#111827;">
          <p>Hello ${buyerName},</p>
          <p>Your booking has been confirmed.</p>
          <table style="width:100%;border-collapse:collapse;margin-top:12px;">
            <tr><td style="border:1px solid #e5e7eb;padding:8px;font-weight:600;">Booking Ref</td><td style="border:1px solid #e5e7eb;padding:8px;">${booking.id}</td></tr>
            <tr><td style="border:1px solid #e5e7eb;padding:8px;font-weight:600;">Farmer Name</td><td style="border:1px solid #e5e7eb;padding:8px;">${farmerName}</td></tr>
            <tr><td style="border:1px solid #e5e7eb;padding:8px;font-weight:600;">Acres Booked</td><td style="border:1px solid #e5e7eb;padding:8px;">${booking.acres_booked}</td></tr>
            <tr><td style="border:1px solid #e5e7eb;padding:8px;font-weight:600;">Amount Paid</td><td style="border:1px solid #e5e7eb;padding:8px;">${amountFormatted}</td></tr>
            <tr><td style="border:1px solid #e5e7eb;padding:8px;font-weight:600;">Status</td><td style="border:1px solid #e5e7eb;padding:8px;">Confirmed</td></tr>
          </table>
          <p style="margin-top:12px;">Thank you for using PotatoMarket Kenya.</p>
        </div>
        <div style="padding:16px;color:#6b7280;border-top:1px solid #e5e7eb;">© PotatoMarket Kenya</div>
      </div>`;
    const appBaseUrl = Deno.env.get("APP_BASE_URL") || "http://localhost:5173";
    const farmerHtml = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e5e7eb;">
        <div style="background:#166534;color:#fff;padding:16px;font-size:20px;font-weight:700;">PotatoMarket Kenya</div>
        <div style="padding:20px;color:#111827;">
          <p>Hello ${farmerName},</p>
          <p>You have a new booking.</p>
          <table style="width:100%;border-collapse:collapse;margin-top:12px;">
            <tr><td style="border:1px solid #e5e7eb;padding:8px;font-weight:600;">Booking Ref</td><td style="border:1px solid #e5e7eb;padding:8px;">${booking.id}</td></tr>
            <tr><td style="border:1px solid #e5e7eb;padding:8px;font-weight:600;">Buyer Name</td><td style="border:1px solid #e5e7eb;padding:8px;">${buyerName}</td></tr>
            <tr><td style="border:1px solid #e5e7eb;padding:8px;font-weight:600;">Buyer Phone</td><td style="border:1px solid #e5e7eb;padding:8px;">${booking.buyers?.phone_number || "-"}</td></tr>
            <tr><td style="border:1px solid #e5e7eb;padding:8px;font-weight:600;">Buyer County</td><td style="border:1px solid #e5e7eb;padding:8px;">${booking.buyers?.county || "-"}</td></tr>
            <tr><td style="border:1px solid #e5e7eb;padding:8px;font-weight:600;">Acres Booked</td><td style="border:1px solid #e5e7eb;padding:8px;">${booking.acres_booked}</td></tr>
          </table>
          <p style="margin-top:12px;"><a href="${appBaseUrl}/login" style="display:inline-block;background:#166534;color:#fff;padding:12px 18px;text-decoration:none;border-radius:6px;font-weight:600;">Log in to view details</a></p>
        </div>
        <div style="padding:16px;color:#6b7280;border-top:1px solid #e5e7eb;">© PotatoMarket Kenya</div>
      </div>`;
    try { if (booking.buyers?.email) await sendEmail(booking.buyers.email, "Booking Confirmed — PotatoMarket Kenya", buyerHtml); } catch (err) { console.error(err); }
    try { if (booking.farmers?.email) await sendEmail(booking.farmers.email, "New Booking — PotatoMarket Kenya", farmerHtml); } catch (err) { console.error(err); }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("payment-webhook error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
