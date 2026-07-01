ALTER TABLE public.farmers
  ADD COLUMN IF NOT EXISTS external_platform_ref text,
  ADD COLUMN IF NOT EXISTS external_callback_url text;

CREATE UNIQUE INDEX IF NOT EXISTS farmers_external_platform_ref_key
  ON public.farmers(external_platform_ref)
  WHERE external_platform_ref IS NOT NULL;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'local',
  ADD COLUMN IF NOT EXISTS external_booking_ref text,
  ADD COLUMN IF NOT EXISTS farmer_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_requested_at timestamptz;

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_source_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_source_check
  CHECK (source IN ('local', 'procurement', 'main_platform'));
