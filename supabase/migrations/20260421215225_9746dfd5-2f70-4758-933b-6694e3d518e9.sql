
CREATE TYPE public.discount_type AS ENUM ('percentage', 'fixed');

CREATE TABLE public.discount_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type public.discount_type NOT NULL,
  value numeric NOT NULL CHECK (value >= 0),
  min_subtotal numeric NOT NULL DEFAULT 0 CHECK (min_subtotal >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.discount_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view discount_rules"
  ON public.discount_rules FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admin/Manager insert discount_rules"
  ON public.discount_rules FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Admin/Manager update discount_rules"
  ON public.discount_rules FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Admin/Manager delete discount_rules"
  ON public.discount_rules FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));
