import { describe, expect, it } from "vitest";
import {
  applyHarvestDateFilters,
  getEstimatedHarvestDate,
} from "../../supabase/functions/external-get-farmers/harvest";
import { validateExternalBookingRequest } from "../../supabase/functions/external-book-farmer/validation";
import {
  validateMainPlatformBookingDecision,
  validateMainPlatformFarmerRegistration,
} from "../../supabase/functions/_shared/main-platform";

describe("external procurement farmers", () => {
  it("estimates Shangi harvest dates from planting dates", () => {
    expect(getEstimatedHarvestDate("2026-05-01", "Shangi")).toBe("2026-07-30");
  });

  it("uses a 100-day harvest fallback for unknown varieties", () => {
    expect(getEstimatedHarvestDate("2026-05-01", "Mystery Potato")).toBe("2026-08-09");
  });

  it("filters farmers before harvest_date_from", () => {
    const farmers = applyHarvestDateFilters([
      { farmer_id: "early", planting_date: "2026-05-01", potato_variety: "Shangi" },
      { farmer_id: "inside", planting_date: "2026-05-15", potato_variety: "Shangi" },
    ], { harvest_date_from: "2026-08-01" });

    expect(farmers.map((farmer) => farmer.farmer_id)).toEqual(["inside"]);
    expect(farmers[0].estimated_harvest_date).toBe("2026-08-13");
  });

  it("filters farmers after harvest_date_to", () => {
    const farmers = applyHarvestDateFilters([
      { farmer_id: "inside", planting_date: "2026-05-01", potato_variety: "Shangi" },
      { farmer_id: "late", planting_date: "2026-05-15", potato_variety: "Shangi" },
    ], { harvest_date_to: "2026-08-01" });

    expect(farmers.map((farmer) => farmer.farmer_id)).toEqual(["inside"]);
    expect(farmers[0].estimated_harvest_date).toBe("2026-07-30");
  });
});

describe("external procurement booking validation", () => {
  const validBody = {
    farmer_id: "F-12345",
    company_name: "Acme Procurement Ltd",
    phone: "0712345678",
    email: "buyer@acme.example.com",
    county: "Nairobi",
    callback_url: "https://procurement.example.com/webhooks/farmer-booking",
  };

  it("accepts the documented booking body", () => {
    expect(validateExternalBookingRequest(validBody)).toEqual({
      ok: true,
      data: validBody,
    });
  });

  it("reports company_name when it is missing", () => {
    const result = validateExternalBookingRequest({ ...validBody, company_name: "" });

    expect(result).toEqual({ ok: false, message: "Missing required fields: company_name" });
  });

  it("does not require name or acres", () => {
    const result = validateExternalBookingRequest({});

    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.message).not.toContain("name, acres");
      expect(result.message).not.toContain("acres");
    }
  });
});

describe("main platform validation", () => {
  const validFarmer = {
    external_platform_ref: "main-123",
    callback_url: "https://main.example.com/webhooks/find-farmers",
    full_name: "Jane Farmer",
    phone_number: "0712345678",
    email: "jane@example.com",
    county: "Nakuru",
    ward: "Njoro",
    specific_location: "Mauche",
    potato_variety: "Shangi",
    acreage_planted: 3,
    planting_date: "2026-05-01",
  };

  it("accepts a main platform farmer registration", () => {
    expect(validateMainPlatformFarmerRegistration(validFarmer)).toEqual({
      ok: true,
      data: validFarmer,
    });
  });

  it("defaults optional main platform registration fields to null", () => {
    const result = validateMainPlatformFarmerRegistration({
      ...validFarmer,
      external_platform_ref: "",
      callback_url: "",
      email: "",
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        external_platform_ref: null,
        callback_url: null,
        email: null,
      },
    });
  });

  it("rejects invalid main platform acreage", () => {
    const result = validateMainPlatformFarmerRegistration({ ...validFarmer, acreage_planted: 0 });
    expect(result).toEqual({ ok: false, status: 400, message: "acreage_planted must be greater than 0" });
  });

  it("accepts approve and reject booking decisions", () => {
    expect(validateMainPlatformBookingDecision({
      farmer_id: "F-12345",
      booking_ref: "00000000-0000-0000-0000-000000000000",
      decision: "approve",
    })).toMatchObject({ ok: true });
    expect(validateMainPlatformBookingDecision({
      farmer_id: "F-12345",
      booking_ref: "00000000-0000-0000-0000-000000000000",
      decision: "reject",
    })).toMatchObject({ ok: true });
  });

  it("rejects invalid booking decisions", () => {
    expect(validateMainPlatformBookingDecision({
      farmer_id: "F-12345",
      booking_ref: "00000000-0000-0000-0000-000000000000",
      decision: "maybe",
    })).toEqual({ ok: false, status: 400, message: "decision must be approve or reject" });
  });
});
