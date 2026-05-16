import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

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
    const { data: existingBuyer } = await supabase
      .from("buyers")
      .select("id")
      .or(`email.eq.${email},phone_number.eq.${phone}`)
      .maybeSingle();

    if (existingBuyer) {
      buyerId = existingBuyer.id;
    } else {
      const { data: newBuyer, error: buyerErr } = await supabase
        .from("buyers")
        .insert({ buyer_name: name, phone_number: phone, email, county })
        .select("id")
        .single();
      if (buyerErr) throw buyerErr;
      buyerId = newBuyer.id;
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

    // Lock farmer
    const { error: lockErr } = await supabase
      .from("farmers")
      .update({ listing_status: "booked" })
      .eq("id", farmer.id);
    if (lockErr) {
      await supabase.from("bookings").delete().eq("id", booking.id);
      throw lockErr;
    }

    // Initialize Paystack
    const paystackKey = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!paystackKey) {
      await supabase.from("bookings").delete().eq("id", booking.id);
      await supabase.from("farmers").update({ listing_status: "available" }).eq("id", farmer.id);
      return new Response(JSON.stringify({ error: "Payment provider not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const psRes = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paystackKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        amount: Math.round(total_amount * 100),
        reference: booking.id,
        metadata: { booking_id: booking.id, farmer_id: farmer.id },
      }),
    });

    const psJson = await psRes.json().catch(() => ({}));
    if (!psRes.ok || !psJson?.status || !psJson?.data?.authorization_url) {
      await supabase.from("bookings").delete().eq("id", booking.id);
      await supabase.from("farmers").update({ listing_status: "available" }).eq("id", farmer.id);
      return new Response(
        JSON.stringify({ error: psJson?.message || "Failed to initialize payment" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        status: 200,
        data: {
          payment_url: psJson.data.authorization_url,
          access_code: psJson.data.access_code,
          booking_ref: booking.id,
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
