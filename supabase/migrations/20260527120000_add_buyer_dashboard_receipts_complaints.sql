ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS received_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS final_price numeric(12,2),
  ADD COLUMN IF NOT EXISTS delivery_date date,
  ADD COLUMN IF NOT EXISTS buyer_rating integer;

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_buyer_rating_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_buyer_rating_check
  CHECK (buyer_rating IS NULL OR (buyer_rating >= 1 AND buyer_rating <= 5));

CREATE TABLE IF NOT EXISTS public.buyer_complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid NOT NULL REFERENCES public.buyers(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  subject text NOT NULL,
  content text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT buyer_complaints_status_check CHECK (status IN ('open', 'in_review', 'resolved')),
  CONSTRAINT buyer_complaints_subject_check CHECK (length(btrim(subject)) > 0),
  CONSTRAINT buyer_complaints_content_check CHECK (length(btrim(content)) > 0)
);

ALTER TABLE public.buyer_complaints ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_buyer_complaints_updated_at ON public.buyer_complaints;
CREATE TRIGGER update_buyer_complaints_updated_at
  BEFORE UPDATE ON public.buyer_complaints
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Admins can view all buyer complaints" ON public.buyer_complaints
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update buyer complaints" ON public.buyer_complaints
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
