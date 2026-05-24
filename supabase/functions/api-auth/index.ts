import { createClient } from "npm:@supabase/supabase-js@2";
import bcrypt from "npm:bcryptjs@2.4.3";
import { sendEmail } from "../_shared/resend.js";

const hash = (s: string, r: number) => bcrypt.hash(s, r);
const compare = (s: string, h: string) => bcrypt.compare(s, h);
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const sb = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const gen = () => crypto.randomUUID() + crypto.randomUUID();
const isEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

async function isAdmin(db: ReturnType<typeof sb>, admin_id?: string) {
  if (!admin_id) return false;
  const { data } = await db.from("admins").select("id").eq("id", admin_id).maybeSingle();
  return Boolean(data);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const url = new URL(req.url);
  const path = url.pathname.split("/api-auth")[1] || "";
  const db = sb();

  if (path === "/login" && req.method === "POST") {
    const { email, password } = await req.json();
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const pwd = String(password || "");
    if (!normalizedEmail || !pwd) return j({ error: "Email and password are required" }, 400);
    const adminEmail = Deno.env.get("ADMIN_EMAIL");
    const adminPass = Deno.env.get("ADMIN_PASSWORD");
    if (adminEmail && adminPass) {
      const normalizedAdminEmail = adminEmail.trim().toLowerCase();
      const { data } = await db.from("admins").select("id").eq("email", normalizedAdminEmail).maybeSingle();
      if (!data) await db.from("admins").insert({ email: normalizedAdminEmail, password_hash: await hash(adminPass, 10) });
    }

    const { data: admin } = await db.from("admins").select("id,email,password_hash").eq("email", normalizedEmail).maybeSingle();
    if (admin?.password_hash && await compare(pwd, admin.password_hash)) return j({ token: gen(), role: "admin", userId: admin.id, email: admin.email });

    const { data: farmer } = await db.from("farmers").select("id,email,password_hash").eq("email", normalizedEmail).maybeSingle();
    if (farmer?.password_hash && await compare(pwd, farmer.password_hash)) return j({ token: gen(), role: "farmer", userId: farmer.id, email: farmer.email });

    const { data: buyer } = await db.from("buyers").select("id,email,password_hash,account_status").eq("email", normalizedEmail).maybeSingle();
    if (buyer?.account_status === "pending_setup" && !buyer?.password_hash) return j({ error: "Please complete your account setup via the link sent to your WhatsApp." }, 401);
    if (buyer?.password_hash && await compare(pwd, buyer.password_hash)) return j({ token: gen(), role: "buyer", userId: buyer.id, email: buyer.email });
    return j({ error: "Invalid email or password" }, 401);
  }

  if (path === "/validate-token") {
    const t = url.searchParams.get("token");
    const { data } = await db.from("buyers").select("id").eq("setup_token", t).gt("setup_token_expires_at", new Date().toISOString()).maybeSingle();
    return j({ valid: Boolean(data) });
  }

  if (path === "/resend-setup-link" && req.method === "POST") {
    const { phone_or_email } = await req.json();
    const t = gen();
    const { data } = await db.from("buyers").select("id").or(`email.eq.${phone_or_email},phone_number.eq.${phone_or_email}`).maybeSingle();
    if (data) await db.from("buyers").update({ setup_token: t, setup_token_expires_at: new Date(Date.now() + 86400000).toISOString() }).eq("id", data.id);
    return j({ ok: true });
  }

  if (path === "/complete-setup" && req.method === "POST") {
    const { token, password } = await req.json();
    const { data } = await db.from("buyers").select("id").eq("setup_token", token).gt("setup_token_expires_at", new Date().toISOString()).maybeSingle();
    if (!data) return j({ error: "This link has expired." }, 400);
    await db.from("buyers").update({ password_hash: await hash(password, 10), account_status: "active", setup_token: null, setup_token_expires_at: null }).eq("id", data.id);
    return j({ ok: true });
  }


  if (path === "/register-buyer" && req.method === "POST") {
    const b = await req.json();
    const name = String(b.buyer_name || b.company_name || "").trim();
    const phone = String(b.phone_number || "").trim();
    const normalizedEmail = String(b.email || "").trim().toLowerCase();
    const countyName = String(b.county || b.primary_county || "").trim();
    const pwd = String(b.password || "");

    if (!name || !phone || !normalizedEmail || !countyName || !pwd || !b.confirm_password) return j({ error: "Missing required fields" }, 400);
    if (!isEmail(normalizedEmail)) return j({ error: "Invalid email" }, 400);
    if (pwd.length < 8) return j({ error: "Password must be at least 8 characters" }, 400);
    if (pwd !== String(b.confirm_password)) return j({ error: "Passwords do not match" }, 400);

    const { data: existing } = await db.from("buyers").select("id").eq("email", normalizedEmail).maybeSingle();
    if (existing) return j({ error: "An account with this email already exists" }, 409);

    const { error } = await db.from("buyers").insert({
      buyer_name: name,
      phone_number: phone,
      email: normalizedEmail,
      county: countyName,
      password_hash: await hash(pwd, 10),
      account_status: "active",
      setup_token: null,
      setup_token_expires_at: null,
      company_name: b.company_name ?? null,
      business_type: b.business_type ?? null,
      primary_county: b.primary_county ?? null,
      primary_town: b.primary_town ?? null,
      additional_locations: b.additional_locations ?? [],
      varieties_required: b.varieties_required ?? [],
      varieties_other: b.varieties_other ?? null,
      quantity_per_order: b.quantity_per_order ?? null,
      quantity_unit: b.quantity_unit ?? null,
      demand_frequency: b.demand_frequency ?? null,
      demand_frequency_custom: b.demand_frequency_custom ?? null,
      quality_preference: b.quality_preference ?? null,
      quality_specifications: b.quality_specifications ?? null,
      contact_full_name: b.contact_full_name ?? null,
      contact_role: b.contact_role ?? null,
      preferred_contact_methods: b.preferred_contact_methods ?? [],
      additional_notes: b.additional_notes ?? null,
      profile_completed: true,
    });

    if (error) return j({ error: error.message }, 400);
    return j({ ok: true });
  }

  if (path === "/register-farmer" && req.method === "POST") {
    const b = await req.json();
    const normalizedEmail = String(b.email || "").trim().toLowerCase();
    const pwd = String(b.password || "");
    const acreage = Number(b.acreage_planted);
    if (!b.full_name || !b.phone_number || !normalizedEmail || !b.county || !b.ward || !b.specific_location || !b.potato_variety || !b.planting_date || !pwd || !b.confirm_password) {
      return j({ error: "Missing required fields" }, 400);
    }
    if (!isEmail(normalizedEmail)) return j({ error: "Invalid email" }, 400);
    if (pwd.length < 8) return j({ error: "Password must be at least 8 characters" }, 400);
    if (pwd !== String(b.confirm_password)) return j({ error: "Passwords do not match" }, 400);
    if (!Number.isFinite(acreage) || acreage <= 0) return j({ error: "Acreage must be greater than 0" }, 400);

    const { data: existing } = await db.from("farmers").select("id").eq("email", normalizedEmail).maybeSingle();
    if (existing) return j({ error: "An account with this email already exists" }, 409);

    const paymentStatus = b.payment_status === "paid" || b.payment_status === "promo_code" ? b.payment_status : "pending";
    const { error } = await db.from("farmers").insert({
      full_name: String(b.full_name).trim(),
      phone_number: String(b.phone_number).trim(),
      email: normalizedEmail,
      county: b.county,
      ward: b.ward,
      specific_location: b.specific_location,
      potato_variety: b.potato_variety,
      acreage_planted: acreage,
      planting_date: b.planting_date,
      payment_status: paymentStatus,
      registration_status: "pending",
      listing_status: "pending_approval",
      registration_fee: paymentStatus === "promo_code" ? 0 : acreage * 2000,
      password_hash: await hash(pwd, 10),
    });
    if (error) return j({ error: error.message }, 400);
    return j({ ok: true });
  }

  if (path === "/buyer/profile/get" && req.method === "POST") {
    const { buyer_id } = await req.json();
    if (!buyer_id) return j({ error: "Missing buyer_id" }, 400);
    const { data, error } = await db.from("buyers").select("*").eq("id", buyer_id).maybeSingle();
    if (error) return j({ error: error.message }, 400);
    return j({ data });
  }

  if (path === "/buyer/bookings" && req.method === "POST") {
    const { buyer_id } = await req.json();
    if (!buyer_id) return j({ error: "Missing buyer_id" }, 400);
    const { data, error } = await db
      .from("bookings")
      .select("id, acres_booked, price_per_acre, total_amount, payment_status, booking_status, created_at, farmers(full_name, county, phone_number, potato_variety)")
      .eq("buyer_id", buyer_id)
      .order("created_at", { ascending: false });
    if (error) return j({ error: error.message }, 400);
    return j({ data });
  }

  if (path === "/buyer/profile" && (req.method === "PATCH" || req.method === "POST")) {
    const b = await req.json();
    if (!b.buyer_id) return j({ error: "Missing buyer_id" }, 400);
    const updates: Record<string, unknown> = {};
    const fields = [
      "buyer_name","phone_number","county",
      "company_name","business_type","primary_county","primary_town","additional_locations",
      "varieties_required","varieties_other","quantity_per_order","quantity_unit",
      "demand_frequency","demand_frequency_custom","quality_preference","quality_specifications",
      "contact_full_name","contact_role","preferred_contact_methods","additional_notes",
    ];
    for (const f of fields) if (f in b) updates[f] = b[f];
    const { error } = await db.from("buyers").update(updates).eq("id", b.buyer_id);
    if (error) return j({ error: error.message }, 400);
    return j({ ok: true });
  }

  if (path === "/buyer/change-password" && req.method === "POST") {
    const { buyer_id, current_password, new_password } = await req.json();
    if (!buyer_id || !current_password || !new_password) return j({ error: "Missing fields" }, 400);
    if (String(new_password).length < 8) return j({ error: "New password must be at least 8 characters" }, 400);
    const { data: buyer } = await db.from("buyers").select("password_hash").eq("id", buyer_id).maybeSingle();
    if (!buyer?.password_hash || !(await compare(current_password, buyer.password_hash))) return j({ error: "Current password is incorrect" }, 401);
    await db.from("buyers").update({ password_hash: await hash(new_password, 10) }).eq("id", buyer_id);
    return j({ ok: true });
  }

  
  if (path === "/farmer/profile/get" && req.method === "POST") {
    const { farmer_id } = await req.json();
    if (!farmer_id) return j({ error: "Missing farmer_id" }, 400);
    const { data, error } = await db.from("farmers").select("full_name, phone_number, email, county, ward, specific_location, potato_variety, acreage_planted").eq("id", farmer_id).maybeSingle();
    if (error) return j({ error: error.message }, 400);
    return j({ data });
  }

  if (path === "/farmer/dashboard" && req.method === "POST") {
    const { farmer_id } = await req.json();
    if (!farmer_id) return j({ error: "Missing farmer_id" }, 400);
    const { data: farmer, error: farmerError } = await db
      .from("farmers")
      .select("registration_status, listing_status, full_name, phone_number, email, county, ward, specific_location, potato_variety, acreage_planted, planting_date")
      .eq("id", farmer_id)
      .maybeSingle();
    if (farmerError) return j({ error: farmerError.message }, 400);
    const { data: bookings, error: bookingsError } = await db
      .from("bookings")
      .select("id, acres_booked, total_amount, price_per_acre, payment_status, booking_status, created_at, buyer_id, buyers(buyer_name, phone_number, email, county)")
      .eq("farmer_id", farmer_id)
      .order("created_at", { ascending: false });
    if (bookingsError) return j({ error: bookingsError.message }, 400);
    return j({ farmer, bookings: bookings || [] });
  }
if (path === "/farmer/profile" && req.method === "GET") {
    const farmer_id = url.searchParams.get("farmer_id");
    if (!farmer_id) return j({ error: "Missing farmer_id" }, 400);
    const { data, error } = await db.from("farmers").select("full_name, phone_number, email, county, ward, specific_location, potato_variety, acreage_planted").eq("id", farmer_id).maybeSingle();
    if (error) return j({ error: error.message }, 400);
    return j({ data });
  }

  if (path === "/farmer/profile" && (req.method === "PATCH" || req.method === "POST")) {
    const { farmer_id, full_name, phone_number, county, ward, specific_location, potato_variety, acreage_planted } = await req.json();
    if (!farmer_id) return j({ error: "Missing farmer_id" }, 400);
    const { error } = await db.from("farmers").update({ full_name, phone_number, county, ward, specific_location, potato_variety, acreage_planted }).eq("id", farmer_id);
    if (error) return j({ error: error.message }, 400);
    return j({ ok: true });
  }

  if (path === "/farmer/change-password" && req.method === "POST") {
    const { farmer_id, current_password, new_password } = await req.json();
    if (!farmer_id || !current_password || !new_password) return j({ error: "Missing fields" }, 400);
    if (String(new_password).length < 8) return j({ error: "New password must be at least 8 characters" }, 400);
    const { data: farmer } = await db.from("farmers").select("password_hash").eq("id", farmer_id).maybeSingle();
    if (!farmer?.password_hash || !(await compare(current_password, farmer.password_hash))) return j({ error: "Current password is incorrect" }, 401);
    await db.from("farmers").update({ password_hash: await hash(new_password, 10) }).eq("id", farmer_id);
    return j({ ok: true });
  }

  // Admin APIs
  if (path === "/admin/farmers" && req.method === "POST") {
    const { admin_id } = await req.json();
    if (!(await isAdmin(db, admin_id))) return j({ error: "Unauthorized" }, 403);
    const { data, error } = await db.from("farmers").select("*").order("created_at", { ascending: false });
    if (error) return j({ error: error.message }, 400);
    return j({ data });
  }

  if (path === "/admin/buyers" && req.method === "POST") {
    const { admin_id } = await req.json();
    if (!(await isAdmin(db, admin_id))) return j({ error: "Unauthorized" }, 403);
    const { data, error } = await db.from("buyers").select("*").order("created_at", { ascending: false });
    if (error) return j({ error: error.message }, 400);
    return j({ data });
  }

  if (path === "/admin/bookings" && req.method === "POST") {
    const { admin_id } = await req.json();
    if (!(await isAdmin(db, admin_id))) return j({ error: "Unauthorized" }, 403);
    const { data, error } = await db.from("bookings").select("*, buyers(*), farmers(*)").order("created_at", { ascending: false });
    if (error) return j({ error: error.message }, 400);
    return j({ data });
  }

  if (path === "/admin/farmer/update" && req.method === "POST") {
    const { admin_id, id, updates } = await req.json();
    if (!(await isAdmin(db, admin_id))) return j({ error: "Unauthorized" }, 403);
    const { data: before } = await db.from("farmers").select("registration_status, full_name, email").eq("id", id).maybeSingle();
    const { error } = await db.from("farmers").update(updates).eq("id", id);
    if (error) return j({ error: error.message }, 400);
    if (before?.registration_status !== "approved" && updates?.registration_status === "approved" && before?.email) {
      const appBaseUrl = Deno.env.get("APP_BASE_URL") || "http://localhost:5173";
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e5e7eb;">
          <div style="background:#166534;color:#fff;padding:16px;font-size:20px;font-weight:700;">PotatoMarket Kenya</div>
          <div style="padding:20px;color:#111827;">
            <p>Hello ${before.full_name || "Farmer"},</p>
            <p>Congratulations! Your PotatoMarket Kenya account has been approved.</p>
            <p>Your listing is now visible to buyers.</p>
            <p><a href="${appBaseUrl}/login" style="display:inline-block;background:#166534;color:#fff;padding:12px 18px;text-decoration:none;border-radius:6px;font-weight:600;">Log in to your account</a></p>
          </div>
          <div style="padding:16px;color:#6b7280;border-top:1px solid #e5e7eb;">© PotatoMarket Kenya</div>
        </div>`;
      try {
        await sendEmail(before.email, "Your PotatoMarket Kenya account has been approved", html);
      } catch (emailErr) {
        console.error("Farmer approved email wrapper error:", emailErr);
      }
    }
    return j({ ok: true });
  }

  if (path === "/admin/farmer/delete" && req.method === "POST") {
    const { admin_id, id } = await req.json();
    if (!(await isAdmin(db, admin_id))) return j({ error: "Unauthorized" }, 403);
    const { error } = await db.from("farmers").delete().eq("id", id);
    if (error) return j({ error: error.message }, 400);
    return j({ ok: true });
  }

  if (path === "/admin/buyer/update" && req.method === "POST") {
    const { admin_id, id, updates } = await req.json();
    if (!(await isAdmin(db, admin_id))) return j({ error: "Unauthorized" }, 403);
    const { error } = await db.from("buyers").update(updates).eq("id", id);
    if (error) return j({ error: error.message }, 400);
    return j({ ok: true });
  }

  if (path === "/admin/buyer/delete" && req.method === "POST") {
    const { admin_id, id } = await req.json();
    if (!(await isAdmin(db, admin_id))) return j({ error: "Unauthorized" }, 403);
    const { error } = await db.from("buyers").delete().eq("id", id);
    if (error) return j({ error: error.message }, 400);
    return j({ ok: true });
  }

  if (path === "/admin/booking/update" && req.method === "POST") {
    const { admin_id, id, farmerId, status } = await req.json();
    if (!(await isAdmin(db, admin_id))) return j({ error: "Unauthorized" }, 403);
    const { error: bookingErr } = await db.from("bookings").update({ booking_status: status, payment_status: status === "confirmed" ? "paid" : "rejected" }).eq("id", id);
    if (bookingErr) return j({ error: bookingErr.message }, 400);
    const { error: farmerErr } = await db.from("farmers").update({ listing_status: status === "confirmed" ? "booked" : "available" }).eq("id", farmerId);
    if (farmerErr) return j({ error: farmerErr.message }, 400);
    return j({ ok: true });
  }

  return j({ error: "Not found" }, 404);
});
