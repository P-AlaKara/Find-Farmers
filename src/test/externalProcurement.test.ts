import { describe, expect, it } from "vitest";
import {
  applyHarvestDateFilters,
  getEstimatedHarvestDate,
} from "../../supabase/functions/external-get-farmers/harvest";
import { validateExternalBookingRequest } from "../../supabase/functions/external-book-farmer/validation";

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
    if (!result.ok) {
      expect(result.message).not.toContain("name, acres");
      expect(result.message).not.toContain("acres");
    }
  });
});
