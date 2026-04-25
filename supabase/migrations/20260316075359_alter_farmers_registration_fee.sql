-- Drop the generated registration_fee column
ALTER TABLE public.farmers DROP COLUMN registration_fee;

-- Add it back as a regular column with default calculation
ALTER TABLE public.farmers ADD COLUMN registration_fee NUMERIC(10,2) DEFAULT 0;

-- Update existing records to set the fee based on acreage and payment_status
UPDATE public.farmers SET registration_fee = CASE
  WHEN payment_status = 'promo_code' THEN 0
  ELSE acreage_planted * 2000
END;