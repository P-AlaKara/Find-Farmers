export type BookingLike = {
  booking_status: string;
  received_confirmed_at?: string | null;
};

export const splitBuyerBookings = <T extends BookingLike>(bookings: T[]) => ({
  activeBookings: bookings.filter((booking) => booking.booking_status === "confirmed" && !booking.received_confirmed_at),
  pendingBookings: bookings.filter((booking) => booking.booking_status === "pending_approval" || booking.booking_status === "approved"),
  historicalBookings: bookings.filter((booking) => Boolean(booking.received_confirmed_at) || booking.booking_status === "rejected"),
});

export const validateReceiptConfirmation = (input: {
  finalPrice: string | number;
  deliveryDate: string;
  rating: string | number;
}) => {
  const finalPrice = Number(input.finalPrice);
  const rating = Number(input.rating);

  if (!Number.isFinite(finalPrice) || finalPrice <= 0) return "Final price must be greater than 0.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.deliveryDate)) return "Delivery date is required.";
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return "Rating must be between 1 and 5.";
  return null;
};

export const validateComplaint = (subject: string, content: string) => {
  if (!subject.trim()) return "Subject is required.";
  if (!content.trim()) return "Complaint details are required.";
  return null;
};
