export const mainPlatformCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export const mainPlatformJson = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...mainPlatformCorsHeaders, "Content-Type": "application/json" },
  });

export const timingSafeEqualString = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
};

export const authorizeMainPlatform = (req: Request) => {
  const expectedKey = Deno.env.get("EXTERNAL_API_KEY_MAIN") || "";
  const providedKey = req.headers.get("x-api-key") || "";
  return Boolean(expectedKey && providedKey && timingSafeEqualString(expectedKey, providedKey));
};

const isValidDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());

const isValidEmail = (value: string) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const isValidUrl = (value: string) => {
  if (!value) return true;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
};

export type MainPlatformFarmerRegistration = {
  external_platform_ref: string | null;
  callback_url: string | null;
  full_name: string;
  phone_number: string;
  email: string | null;
  county: string;
  ward: string;
  specific_location: string;
  potato_variety: string;
  acreage_planted: number;
  planting_date: string;
};

export type ValidationResult<T> = { ok: true; data: T } | { ok: false; status: number; message: string };

export const validateMainPlatformFarmerRegistration = (body: Record<string, unknown>): ValidationResult<MainPlatformFarmerRegistration> => {
  const acreage = Number(body.acreage_planted);
  const data = {
    external_platform_ref: String(body.external_platform_ref || "").trim() || null,
    callback_url: String(body.callback_url || "").trim() || null,
    full_name: String(body.full_name || "").trim(),
    phone_number: String(body.phone_number || "").trim(),
    email: String(body.email || "").trim().toLowerCase() || null,
    county: String(body.county || "").trim(),
    ward: String(body.ward || "").trim(),
    specific_location: String(body.specific_location || "").trim(),
    potato_variety: String(body.potato_variety || "").trim(),
    acreage_planted: acreage,
    planting_date: String(body.planting_date || "").trim(),
  };

  const missing: string[] = [];
  if (!data.full_name) missing.push("full_name");
  if (!data.phone_number) missing.push("phone_number");
  if (!data.county) missing.push("county");
  if (!data.ward) missing.push("ward");
  if (!data.specific_location) missing.push("specific_location");
  if (!data.potato_variety) missing.push("potato_variety");
  if (body.acreage_planted === undefined || body.acreage_planted === null || String(body.acreage_planted).trim() === "") {
    missing.push("acreage_planted");
  }
  if (!data.planting_date) missing.push("planting_date");
  if (missing.length) return { ok: false, status: 400, message: `Missing required fields: ${missing.join(", ")}` };

  if (!Number.isFinite(data.acreage_planted) || data.acreage_planted <= 0) {
    return { ok: false, status: 400, message: "acreage_planted must be greater than 0" };
  }
  if (!isValidDate(data.planting_date)) return { ok: false, status: 400, message: "planting_date must be a valid YYYY-MM-DD date" };
  if (data.email && !isValidEmail(data.email)) return { ok: false, status: 400, message: "email must be a valid email address" };
  if (data.callback_url && !isValidUrl(data.callback_url)) return { ok: false, status: 400, message: "callback_url must be a valid URL" };

  return { ok: true, data };
};

export type MainPlatformBookingDecision = {
  farmer_id: string;
  booking_ref: string;
  decision: "approve" | "reject";
};

export const validateMainPlatformBookingDecision = (body: Record<string, unknown>): ValidationResult<MainPlatformBookingDecision> => {
  const data = {
    farmer_id: String(body.farmer_id || "").trim(),
    booking_ref: String(body.booking_ref || "").trim(),
    decision: String(body.decision || "").trim().toLowerCase(),
  };

  const missing: string[] = [];
  if (!data.farmer_id) missing.push("farmer_id");
  if (!data.booking_ref) missing.push("booking_ref");
  if (!data.decision) missing.push("decision");
  if (missing.length) return { ok: false, status: 400, message: `Missing required fields: ${missing.join(", ")}` };

  if (data.decision !== "approve" && data.decision !== "reject") {
    return { ok: false, status: 400, message: "decision must be approve or reject" };
  }

  return { ok: true, data: data as MainPlatformBookingDecision };
};

export const postMainPlatformCallback = async (
  callbackUrl: string | null | undefined,
  payload: Record<string, unknown>,
) => {
  if (!callbackUrl) return { delivered: false, skipped: true };
  try {
    const res = await fetch(callbackUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error("Main platform callback non-OK:", res.status, await res.text());
      return { delivered: false, status: res.status };
    }
    return { delivered: true, status: res.status };
  } catch (err) {
    console.error("Main platform callback failed:", err);
    return { delivered: false, error: "network_error" };
  }
};
