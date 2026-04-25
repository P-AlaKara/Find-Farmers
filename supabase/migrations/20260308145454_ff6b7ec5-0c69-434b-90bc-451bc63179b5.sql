
-- Fix generate_short_id search path
CREATE OR REPLACE FUNCTION public.generate_short_id(prefix TEXT DEFAULT 'F')
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RETURN prefix || '-' || LPAD(FLOOR(RANDOM() * 100000)::TEXT, 5, '0');
END;
$$;
