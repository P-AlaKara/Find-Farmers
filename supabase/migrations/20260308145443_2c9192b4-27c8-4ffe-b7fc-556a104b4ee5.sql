
-- Create enum types
CREATE TYPE public.registration_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE public.payment_status AS ENUM ('pending', 'paid', 'promo_code', 'rejected');
CREATE TYPE public.listing_status AS ENUM ('available', 'pending_approval', 'booked');
CREATE TYPE public.booking_status AS ENUM ('pending_approval', 'approved', 'rejected');
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function for role checking
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- Generate short random ID
CREATE OR REPLACE FUNCTION public.generate_short_id(prefix TEXT DEFAULT 'F')
RETURNS TEXT
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN prefix || '-' || LPAD(FLOOR(RANDOM() * 100000)::TEXT, 5, '0');
END;
$$;

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Farmers table
CREATE TABLE public.farmers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farmer_id TEXT UNIQUE DEFAULT public.generate_short_id('F'),
  full_name TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  email TEXT,
  county TEXT NOT NULL,
  ward TEXT NOT NULL,
  specific_location TEXT NOT NULL,
  potato_variety TEXT NOT NULL,
  acreage_planted NUMERIC(10,2) NOT NULL CHECK (acreage_planted > 0),
  planting_date DATE NOT NULL,
  registration_status registration_status NOT NULL DEFAULT 'pending',
  payment_status payment_status NOT NULL DEFAULT 'pending',
  listing_status listing_status NOT NULL DEFAULT 'pending_approval',
  registration_fee NUMERIC(10,2) GENERATED ALWAYS AS (acreage_planted * 2000) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.farmers ENABLE ROW LEVEL SECURITY;

-- Buyers table
CREATE TABLE public.buyers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_name TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  email TEXT NOT NULL,
  county TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.buyers ENABLE ROW LEVEL SECURITY;

-- Bookings table
CREATE TABLE public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id UUID REFERENCES public.buyers(id) ON DELETE CASCADE NOT NULL,
  farmer_id UUID REFERENCES public.farmers(id) ON DELETE CASCADE NOT NULL,
  acres_booked NUMERIC(10,2) NOT NULL CHECK (acres_booked > 0),
  price_per_acre NUMERIC(10,2) NOT NULL DEFAULT 5000,
  total_amount NUMERIC(10,2) GENERATED ALWAYS AS (acres_booked * 5000) STORED,
  payment_status payment_status NOT NULL DEFAULT 'pending',
  booking_status booking_status NOT NULL DEFAULT 'pending_approval',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- user_roles
CREATE POLICY "Admins can read all roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can read own role" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Farmers
CREATE POLICY "Anyone can view approved farmers" ON public.farmers
  FOR SELECT USING (registration_status = 'approved');

CREATE POLICY "Admins can view all farmers" ON public.farmers
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can register as farmer" ON public.farmers
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Admins can update farmers" ON public.farmers
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete farmers" ON public.farmers
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Buyers
CREATE POLICY "Admins can view all buyers" ON public.buyers
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can register as buyer" ON public.buyers
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Public can view buyers" ON public.buyers
  FOR SELECT USING (true);

-- Bookings
CREATE POLICY "Admins can view all bookings" ON public.bookings
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can create booking" ON public.bookings
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Admins can update bookings" ON public.bookings
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete bookings" ON public.bookings
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Triggers
CREATE TRIGGER update_farmers_updated_at
  BEFORE UPDATE ON public.farmers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_bookings_updated_at
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
