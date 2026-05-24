ALTER TABLE public.bookings 
DROP COLUMN total_amount;

-- Update bookings table to allow more decimal precision for acres_booked
ALTER TABLE public.bookings
ALTER COLUMN acres_booked TYPE NUMERIC(10,4);

ALTER TABLE public.bookings 
ADD COLUMN total_amount NUMERIC GENERATED ALWAYS AS (acres_booked * price_per_acre) STORED;

-- Update the check constraint to ensure positive values
ALTER TABLE public.bookings
DROP CONSTRAINT bookings_acres_booked_check;

ALTER TABLE public.bookings
ADD CONSTRAINT bookings_acres_booked_check CHECK (acres_booked > 0);