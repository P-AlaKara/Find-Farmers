export type ExternalBookingRequest = {
  farmer_id: string;
  company_name: string;
  phone: string;
  email: string;
  county: string;
  callback_url: string;
};

export type ExternalBookingValidationResult =
  | { ok: true; data: ExternalBookingRequest }
  | { ok: false; message: string };

export const validateExternalBookingRequest = (body: Record<string, unknown>): ExternalBookingValidationResult => {
  const data = {
    farmer_id: String(body.farmer_id || "").trim(),
    company_name: String(body.company_name || "").trim(),
    phone: String(body.phone || "").trim(),
    email: String(body.email || "").trim().toLowerCase(),
    county: String(body.county || "").trim(),
    callback_url: String(body.callback_url || "").trim(),
  };

  const missing: string[] = [];
  if (!data.farmer_id) missing.push("farmer_id");
  if (!data.company_name) missing.push("company_name");
  if (!data.phone) missing.push("phone");
  if (!data.email) missing.push("email");
  if (!data.county) missing.push("county");
  if (!data.callback_url) missing.push("callback_url");

  if (missing.length) {
    return { ok: false, message: `Missing required fields: ${missing.join(", ")}` };
  }

  return { ok: true, data };
};
