import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { sendEmail } from "../_shared/resend.js";

const formatMpesaPhone = (phone: string) => {
  const cleaned = phone.replace(/[\s\-()]/g, "");
  if (cleaned.startsWith("+254")) return cleaned.slice(1);
  if (cleaned.startsWith("0")) return `254${cleaned.slice(1)}`;
  return cleaned;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { farmer_id, name, phone, email, county, acres } = body;
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const normalizedPhone = String(phone || "").replace(/[\s\-()]/g, "");
    if (!farmer_id || !name || !phone || !email || !county || acres === undefined || acres === null) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const acresNum = Number(acres);
    if (!Number.isFinite(acresNum) || acresNum <= 0) {
      return new Response(JSON.stringify({ error: "Acres must be greater than 0" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Lookup farmer
    const { data: farmer, error: farmerErr } = await supabase
      .from("farmers")
      .select("id, registration_status, listing_status, acreage_planted")
      .eq("id", farmer_id)
      .maybeSingle();

    if (farmerErr) throw farmerErr;
    if (!farmer) {
      return new Response(JSON.stringify({ error: "Farmer not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (farmer.registration_status !== "approved" || farmer.listing_status !== "available") {
      return new Response(JSON.stringify({ error: "Farmer is not available for booking" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (acresNum > Number(farmer.acreage_planted)) {
      return new Response(JSON.stringify({ error: "Requested acres exceed farmer's planted acreage" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find or create buyer
    let buyerId: string | null = null;
    const { data: existingBuyers, error: existingBuyerErr } = await supabase
      .from("buyers")
      .select("id, account_status, email, phone_number")
      .or(`email.eq.${normalizedEmail},phone_number.eq.${normalizedPhone}`);

    if (existingBuyerErr) {
      throw new Error(`Failed to lookup buyer: ${existingBuyerErr.message}`);
    }

    if ((existingBuyers || []).length > 1) {
      return new Response(JSON.stringify({ error: "An account with that email/phone already exists with conflicting records. Please contact support." }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const existingBuyer = existingBuyers?.[0] ?? null;

    if (existingBuyer) {
      buyerId = existingBuyer.id;
      if (existingBuyer.account_status === "pending_setup") {
        await supabase.from("buyers").update({ setup_token: crypto.randomUUID() + crypto.randomUUID(), setup_token_expires_at: new Date(Date.now()+86400000).toISOString() }).eq("id", existingBuyer.id);
      }
    } else {
      const { data: newBuyer, error: buyerErr } = await supabase
        .from("buyers")
        .insert({ buyer_name: name, phone_number: normalizedPhone, email: normalizedEmail, county, setup_token: crypto.randomUUID() + crypto.randomUUID(), setup_token_expires_at: new Date(Date.now()+86400000).toISOString(), account_status: "pending_setup" })
        .select("id, setup_token")
        .single();
      if (buyerErr) {
        const code = (buyerErr as { code?: string }).code;
        if (code === "23505") {
          return new Response(JSON.stringify({ error: "An account with this email or phone number already exists. Please use the same contact details or contact support." }), {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        throw buyerErr;
      }
      buyerId = newBuyer.id;
      const appBaseUrl = Deno.env.get("APP_BASE_URL") || "http://localhost:5173";
      const setupLink = `${appBaseUrl}/setup-account?token=${encodeURIComponent(newBuyer.setup_token)}`;
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e5e7eb;">
          <div style="background:#166534;color:#fff;padding:16px;font-size:20px;font-weight:700;">PotatoMarket Kenya</div>
          <div style="padding:20px;color:#111827;">
            <p>Hello ${name},</p>
            <p>Your booking was successful and your account has been created.</p>
            <p><a href="${setupLink}" style="display:inline-block;background:#166534;color:#fff;padding:12px 18px;text-decoration:none;border-radius:6px;font-weight:600;">Complete Account Setup</a></p>
            <p>This link expires in 24 hours.</p>
            <p>If the link expires, request a new one at:<br/><a href="${appBaseUrl}/setup-account">${appBaseUrl}/setup-account</a></p>
          </div>
          <div style="padding:16px;color:#6b7280;border-top:1px solid #e5e7eb;">© PotatoMarket Kenya</div>
        </div>`;
      try {
        await sendEmail(email, "Complete your PotatoMarket Kenya account setup", html);
      } catch (emailErr) {
        console.error("Buyer setup email wrapper error:", emailErr);
      }
    }

    const total_amount = acresNum * 5000;

    // Create booking
    const { data: booking, error: bookingErr } = await supabase
      .from("bookings")
      .insert({
        buyer_id: buyerId,
        farmer_id: farmer.id,
        acres_booked: acresNum,
        price_per_acre: 5000,
        payment_status: "pending",
        booking_status: "pending_approval",
      })
      .select("id")
      .single();
    if (bookingErr) throw bookingErr;

    const paymentReference = booking.id.replace(/-/g, "");
    const { error: refErr } = await supabase
      .from("bookings")
      .update({ payment_reference: paymentReference })
      .eq("id", booking.id);
    if (refErr) {
      await supabase.from("bookings").delete().eq("id", booking.id);
      throw refErr;
    }

    // Lock farmer
    const { error: lockErr } = await supabase
      .from("farmers")
      .update({ listing_status: "booked" })
      .eq("id", farmer.id);
    if (lockErr) {
      await supabase.from("bookings").delete().eq("id", booking.id);
      throw lockErr;
    }

    // Charge via Paystack M-Pesa
    const paystackKey = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!paystackKey) {
      await supabase.from("bookings").delete().eq("id", booking.id);
      await supabase.from("farmers").update({ listing_status: "available" }).eq("id", farmer.id);
      return new Response(JSON.stringify({ error: "Payment provider not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const formattedPhone = formatMpesaPhone(phone);
    const psRes = await fetch("https://api.paystack.co/charge", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paystackKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        amount: Math.round(total_amount * 100),
        currency: "KES",
        mobile_money: {
          phone: formattedPhone,
          provider: "mpesa",
        },
        reference: paymentReference,
        metadata: { booking_id: booking.id, farmer_id: farmer.id },
      }),
    });

    const psJson = await psRes.json().catch(() => ({}));
    if (!psRes.ok || !psJson?.status) {
      await supabase.from("bookings").delete().eq("id", booking.id);
      await supabase.from("farmers").update({ listing_status: "available" }).eq("id", farmer.id);
      return new Response(
        JSON.stringify({ error: psJson?.message || "Failed to initialize M-Pesa charge", paystack_status: psRes.status }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        status: 200,
        data: {
          booking_ref: booking.id,
          reference: paymentReference,
          message: `An M-Pesa payment prompt has been sent to ${formattedPhone}. Please enter your PIN to complete the booking.`,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("initialize-payment error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
