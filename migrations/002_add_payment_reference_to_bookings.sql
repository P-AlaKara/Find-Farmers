ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS payment_reference text;

CREATE UNIQUE INDEX IF NOT EXISTS bookings_payment_reference_key
ON public.bookings(payment_reference)
WHERE payment_reference IS NOT NULL;
