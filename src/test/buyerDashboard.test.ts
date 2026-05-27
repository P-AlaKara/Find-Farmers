import { describe, expect, it } from "vitest";
import { splitBuyerBookings, validateComplaint, validateReceiptConfirmation } from "@/lib/buyerDashboard";

describe("buyer dashboard helpers", () => {
  it("groups active, pending, and historical bookings", () => {
    const grouped = splitBuyerBookings([
      { id: "active", booking_status: "confirmed", received_confirmed_at: null },
      { id: "received", booking_status: "confirmed", received_confirmed_at: "2026-05-27T10:00:00Z" },
      { id: "pending", booking_status: "pending_approval", received_confirmed_at: null },
      { id: "approved", booking_status: "approved", received_confirmed_at: null },
      { id: "rejected", booking_status: "rejected", received_confirmed_at: null },
    ]);

    expect(grouped.activeBookings.map((booking) => booking.id)).toEqual(["active"]);
    expect(grouped.pendingBookings.map((booking) => booking.id)).toEqual(["pending", "approved"]);
    expect(grouped.historicalBookings.map((booking) => booking.id)).toEqual(["received", "rejected"]);
  });

  it("validates receipt confirmation fields", () => {
    expect(validateReceiptConfirmation({ finalPrice: "15000", deliveryDate: "2026-05-27", rating: "5" })).toBeNull();
    expect(validateReceiptConfirmation({ finalPrice: "0", deliveryDate: "2026-05-27", rating: "5" })).toMatch(/Final price/);
    expect(validateReceiptConfirmation({ finalPrice: "15000", deliveryDate: "", rating: "5" })).toMatch(/Delivery date/);
    expect(validateReceiptConfirmation({ finalPrice: "15000", deliveryDate: "2026-05-27", rating: "6" })).toMatch(/Rating/);
  });

  it("validates complaint subject and content", () => {
    expect(validateComplaint("Late delivery", "The delivery arrived late.")).toBeNull();
    expect(validateComplaint("", "The delivery arrived late.")).toMatch(/Subject/);
    expect(validateComplaint("Late delivery", "   ")).toMatch(/details/);
  });
});
