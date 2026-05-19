ALTER TABLE public.buyers
ADD CONSTRAINT buyers_phone_number_unique UNIQUE (phone_number);
