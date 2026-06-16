import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { validateExternalBookingRequest } from "./validation.ts";

const PRICE_PER_ACRE = 5000;

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
  try {
    new URL(s);
    return true;
  } catch {
    return false;
  }
};

const formatMpesaPhone = (phone: string) => {
  const digits = String(phone || "").replace(/\D/g, "");
  let local = "";

  if (digits.startsWith("254")) local = digits.slice(3);
  else if (digits.startsWith("0")) local = digits.slice(1);
  else if (digits.length === 9) local = digits;

  if (!/^(7|1)\d{8}$/.test(local)) return null;
  return `+254${local}`;
};

const rollbackReservation = async (
  supabase: ReturnType<typeof createClient>,
  bookingId: string | null,
  farmerId: string | null,
) => {
  if (bookingId) {
    const { error } = await supabase.from("bookings").delete().eq("id", bookingId);
    if (error) console.error("External booking rollback delete failed:", error);
  }

  if (farmerId) {
    const { error } = await supabase
      .from("farmers")
      .update({ listing_status: "available" })
      .eq("id", farmerId)
      .eq("listing_status", "booked");
    if (error) console.error("External booking rollback farmer release failed:", error);
  }
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
    if (req.method !== "POST") return json(405, { status: 405, message: "Method not allowed" });

    const expectedKey = Deno.env.get("EXTERNAL_API_KEY");
    const providedKey = req.headers.get("x-api-key");
    if (!expectedKey || !providedKey || providedKey !== expectedKey) {
      return json(401, { status: 401, message: "Unauthorized" });
    }

    const body = await req.json().catch(() => null);
    if (!body) return json(400, { status: 400, message: "Invalid JSON body" });

    const validated = validateExternalBookingRequest(body);
    if (!validated.ok) return json(400, { status: 400, message: validated.message });
    const { farmer_id, company_name, phone, email, county, callback_url } = validated.data;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json(400, { status: 400, message: "email must be a valid email address" });
    }
    if (!isValidUrl(callback_url)) {
      return json(400, { status: 400, message: "callback_url must be a valid URL" });
    }

    const formattedPhone = formatMpesaPhone(phone);
    if (!formattedPhone) {
      return json(400, {
        status: 400,
        message: "phone must be a valid Kenyan M-Pesa number, for example 07XXXXXXXX or +2547XXXXXXXX",
      });
    }

    const { data: farmer, error: farmerErr } = await supabase
      .from("farmers")
      .select("id, farmer_id, acreage_planted, registration_status, listing_status")
      .eq("farmer_id", farmer_id)
      .maybeSingle();

    if (farmerErr) {
      console.error("Farmer lookup error:", farmerErr);
      return json(500, { status: 500, message: "Internal server error" });
    }
    if (!farmer) return json(404, { status: 404, message: "Farmer not found" });
    if (farmer.registration_status !== "approved" || farmer.listing_status !== "available") {
      return json(400, { status: 400, message: "Farmer is not available for booking" });
    }

    const farmAcreage = Number(farmer.acreage_planted);
    if (!Number.isFinite(farmAcreage) || farmAcreage <= 0) {
      return json(400, { status: 400, message: "Farmer listing has invalid acreage" });
    }

    let buyerId: string | null = null;
    const { data: buyerByEmail, error: buyerByEmailErr } = await supabase
      .from("buyers")
      .select("id")
      .eq("email", email)
      .limit(1);
    if (buyerByEmailErr) {
      console.error("Buyer email lookup error:", buyerByEmailErr);
      return json(500, { status: 500, message: "Internal server error" });
    }

    if (buyerByEmail && buyerByEmail.length > 0) {
      buyerId = buyerByEmail[0].id;
    } else {
      const { data: buyerByPhone, error: buyerByPhoneErr } = await supabase
        .from("buyers")
        .select("id")
        .eq("phone_number", phone)
        .limit(1);
      if (buyerByPhoneErr) {
        console.error("Buyer phone lookup error:", buyerByPhoneErr);
        return json(500, { status: 500, message: "Internal server error" });
      }
      buyerId = buyerByPhone && buyerByPhone.length > 0 ? buyerByPhone[0].id : null;
    }

    if (buyerId) {
      const { error: updateBuyerErr } = await supabase
        .from("buyers")
        .update({
          buyer_name: company_name,
          company_name,
          phone_number: phone,
          email,
          county,
          primary_county: county,
        })
        .eq("id", buyerId);
      if (updateBuyerErr) {
        console.error("Buyer update error:", updateBuyerErr);
        return json(500, { status: 500, message: "Failed to update buyer" });
      }
    } else {
      const { data: newBuyer, error: createBuyerErr } = await supabase
        .from("buyers")
        .insert({
          buyer_name: company_name,
          company_name,
          phone_number: phone,
          email,
          county,
          primary_county: county,
          account_status: "active",
          profile_completed: false,
        })
        .select("id")
        .single();
      if (createBuyerErr || !newBuyer) {
        console.error("Buyer create error:", createBuyerErr);
        return json(500, { status: 500, message: "Failed to create buyer" });
      }
      buyerId = newBuyer.id;
    }

    const { data: booking, error: bookingErr } = await supabase
      .from("bookings")
      .insert({
        buyer_id: buyerId,
        farmer_id: farmer.id,
        acres_booked: farmAcreage,
        price_per_acre: PRICE_PER_ACRE,
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
    bookingId = booking.id;

    const { data: lockedFarmer, error: updateFarmerErr } = await supabase
      .from("farmers")
      .update({ listing_status: "booked" })
      .eq("id", farmer.id)
      .eq("listing_status", "available")
      .select("id")
      .maybeSingle();
    if (updateFarmerErr) {
      console.error("Farmer status update error:", updateFarmerErr);
      await rollbackReservation(supabase, bookingId, null);
      return json(500, { status: 500, message: "Failed to reserve farmer listing" });
    }
    if (!lockedFarmer) {
      await rollbackReservation(supabase, bookingId, null);
      return json(409, { status: 409, message: "Farmer is no longer available for booking" });
    }
    lockedFarmerId = farmer.id;

    const paystackKey = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!paystackKey) {
      await rollbackReservation(supabase, bookingId, lockedFarmerId);
      return json(500, { status: 500, message: "Payment provider not configured" });
    }

    const paymentReference = booking.id.replace(/-/g, "");
    const totalAmount = farmAcreage * PRICE_PER_ACRE;
    const { error: refErr } = await supabase
      .from("bookings")
      .update({ payment_reference: paymentReference })
      .eq("id", booking.id);
    if (refErr) {
      console.error("Payment reference update error:", refErr);
      await rollbackReservation(supabase, bookingId, lockedFarmerId);
      return json(500, { status: 500, message: "Failed to store payment reference" });
    }

    const paystackRes = await fetch("https://api.paystack.co/charge", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paystackKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: Math.round(totalAmount * 100),
        email,
        currency: "KES",
        mobile_money: {
          phone: formattedPhone,
          provider: "mpesa",
        },
        reference: paymentReference,
        metadata: {
          booking_id: booking.id,
          farmer_id: farmer.id,
          public_farmer_id: farmer.farmer_id,
          buyer_id: buyerId,
          company_name,
          buyer_county: county,
        },
      }),
    });

    const paystackJson = await paystackRes.json().catch(() => ({}));
    if (!paystackRes.ok || !paystackJson?.status) {
      console.error("Paystack charge error:", paystackJson);
      await rollbackReservation(supabase, bookingId, lockedFarmerId);
      return json(500, {
        status: 500,
        message: paystackJson?.message || "Payment initialization failed",
      });
    }

    return json(200, {
      status: 200,
      data: {
        booking_ref: booking.id,
        payment_reference: paymentReference,
        reference: paymentReference,
        total_amount: totalAmount,
        farm_acreage: farmAcreage,
        payment_method: "mpesa",
        message: `An M-Pesa payment prompt has been sent to ${formattedPhone}. The customer should enter their PIN to complete payment.`,
      },
    });
  } catch (err) {
    console.error("Unexpected external booking error:", err);
    await rollbackReservation(supabase, bookingId, lockedFarmerId);
    return json(500, { status: 500, message: "Internal server error" });
  }
});
