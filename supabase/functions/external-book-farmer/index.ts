import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const isValidUrl = (s: string) => {
  try { new URL(s); return true; } catch { return false; }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") return json(405, { status: 405, message: "Method not allowed" });

    const expectedKey = Deno.env.get("EXTERNAL_API_KEY");
    const providedKey = req.headers.get("x-api-key");
    if (!expectedKey || !providedKey || providedKey !== expectedKey) {
      return json(401, { status: 401, message: "Unauthorized" });
    }

    let body: any;
    try { body = await req.json(); } catch { return json(400, { status: 400, message: "Invalid JSON body" }); }

    const { farmer_id, name, phone, email, county, acres, callback_url } = body ?? {};
    const missing: string[] = [];
    if (!farmer_id) missing.push("farmer_id");
    if (!name) missing.push("name");
    if (!phone) missing.push("phone");
    if (!email) missing.push("email");
    if (!county) missing.push("county");
    if (acres === undefined || acres === null) missing.push("acres");
    if (!callback_url) missing.push("callback_url");
    if (missing.length) return json(400, { status: 400, message: `Missing required fields: ${missing.join(", ")}` });

    if (typeof acres !== "number" || acres <= 0) {
      return json(400, { status: 400, message: "acres must be a positive number" });
    }
    if (typeof callback_url !== "string" || !isValidUrl(callback_url)) {
      return json(400, { status: 400, message: "callback_url must be a valid URL" });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Lookup farmer
    const { data: farmer, error: farmerErr } = await supabase
      .from("farmers")
      .select("id, acreage_planted, registration_status, listing_status")
      .eq("id", farmer_id)
      .maybeSingle();

    if (farmerErr) {
      console.error("Farmer lookup error:", farmerErr);
      return json(500, { status: 500, message: "Internal server error" });
    }
    if (!farmer) return json(404, { status: 404, message: "Farmer not found" });
    if (farmer.registration_status !== "approved" || farmer.listing_status !== "available") {
      return json(400, { status: 400, message: "Farmer is not available for booking" });
    }
    if (Number(farmer.acreage_planted) < Number(acres)) {
      return json(400, { status: 400, message: "Requested acres exceed farmer's planted acreage" });
    }

    // 2. Find or create buyer
    let buyerId: string | null = null;
    const { data: existingBuyers, error: buyerLookupErr } = await supabase
      .from("buyers")
      .select("id")
      .or(`email.eq.${email},phone_number.eq.${phone}`)
      .limit(1);
    if (buyerLookupErr) {
      console.error("Buyer lookup error:", buyerLookupErr);
      return json(500, { status: 500, message: "Internal server error" });
    }
    if (existingBuyers && existingBuyers.length > 0) {
      buyerId = existingBuyers[0].id;
    } else {
      const { data: newBuyer, error: createBuyerErr } = await supabase
        .from("buyers")
        .insert({ buyer_name: name, phone_number: phone, email, county })
        .select("id")
        .single();
      if (createBuyerErr || !newBuyer) {
        console.error("Buyer create error:", createBuyerErr);
        return json(500, { status: 500, message: "Failed to create buyer" });
      }
      buyerId = newBuyer.id;
    }

    // 3-4. Create booking
    const total_amount = Number(acres) * 5000;
    const { data: booking, error: bookingErr } = await supabase
      .from("bookings")
      .insert({
        buyer_id: buyerId,
        farmer_id: farmer.id,
        acres_booked: acres,
        price_per_acre: 5000,
        total_amount,
        payment_status: "pending",
        booking_status: "pending_approval",
        callback_url,
      })
      .select("id")
      .single();
    if (bookingErr || !booking) {
      console.error("Booking create error:", bookingErr);
      return json(500, { status: 500, message: "Failed to create booking" });
    }

    // 5. Mark farmer as booked
    const { error: updateFarmerErr } = await supabase
      .from("farmers")
      .update({ listing_status: "booked" })
      .eq("id", farmer.id);
    if (updateFarmerErr) {
      console.error("Farmer status update error:", updateFarmerErr);
      await supabase.from("bookings").delete().eq("id", booking.id);
      return json(500, { status: 500, message: "Failed to reserve farmer listing" });
    }

    // 6. Initialize Paystack
    const paystackKey = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!paystackKey) {
      await supabase.from("bookings").delete().eq("id", booking.id);
      await supabase.from("farmers").update({ listing_status: "available" }).eq("id", farmer.id);
      return json(500, { status: 500, message: "Payment provider not configured" });
    }

    try {
      const paystackRes = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${paystackKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: Math.round(total_amount * 100),
          email,
          reference: booking.id,
          callback_url,
          metadata: { booking_id: booking.id, farmer_id: farmer.id },
        }),
      });
      const paystackJson = await paystackRes.json();
      if (!paystackRes.ok || !paystackJson?.status || !paystackJson?.data?.authorization_url) {
        throw new Error(paystackJson?.message || "Paystack initialization failed");
      }

      return json(200, {
        status: 200,
        data: {
          payment_url: paystackJson.data.authorization_url,
          booking_ref: booking.id,
        },
      });
    } catch (payErr) {
      console.error("Paystack error:", payErr);
      await supabase.from("bookings").delete().eq("id", booking.id);
      await supabase.from("farmers").update({ listing_status: "available" }).eq("id", farmer.id);
      return json(500, { status: 500, message: (payErr as Error).message || "Payment initialization failed" });
    }
  } catch (err) {
    console.error("Unexpected error:", err);
    return json(500, { status: 500, message: "Internal server error" });
  }
});
