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

    const { farmer_id, buyer_id: providedBuyerId, name, phone, email, county, acres } = body;
    if (!farmer_id) {
      return new Response(JSON.stringify({ error: "Missing farmer_id" }), {
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

    // Enforce full-acreage booking
    const acresNum = Number(farmer.acreage_planted);
    if (!Number.isFinite(acresNum) || acresNum <= 0) {
      return new Response(JSON.stringify({ error: "Invalid farmer acreage" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve buyer: prefer authenticated buyer_id; fall back to legacy lookup/create for back-compat
    let buyerId: string | null = null;
    let buyerEmail = String(email || "").trim().toLowerCase();
    let buyerPhone = String(phone || "").trim();
    let buyerName = String(name || "").trim();

    if (providedBuyerId) {
      const { data: b } = await supabase.from("buyers").select("id, email, phone_number, buyer_name").eq("id", providedBuyerId).maybeSingle();
      if (!b) {
        return new Response(JSON.stringify({ error: "Buyer account not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      buyerId = b.id;
      buyerEmail = b.email;
      buyerPhone = b.phone_number;
      buyerName = b.buyer_name;
    } else {
      if (!name || !phone || !email || !county) {
        return new Response(JSON.stringify({ error: "Missing required fields" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: existingBuyer } = await supabase
        .from("buyers")
        .select("id, account_status")
        .or(`email.eq.${buyerEmail},phone_number.eq.${buyerPhone}`)
        .maybeSingle();
      if (existingBuyer) {
        buyerId = existingBuyer.id;
      } else {
        const { data: newBuyer, error: buyerErr } = await supabase
          .from("buyers")
          .insert({ buyer_name: buyerName, phone_number: buyerPhone, email: buyerEmail, county, account_status: "pending_setup" })
          .select("id")
          .single();
        if (buyerErr) throw buyerErr;
        buyerId = newBuyer.id;
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

    const formattedPhone = formatMpesaPhone(buyerPhone);
    const psRes = await fetch("https://api.paystack.co/charge", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paystackKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: buyerEmail,
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
