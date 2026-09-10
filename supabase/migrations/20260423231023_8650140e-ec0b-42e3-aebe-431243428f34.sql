-- Enums for medicine classification
CREATE TYPE public.medicine_type AS ENUM ('tablet','capsule','syrup','injection','cream','drops','powder','other');
CREATE TYPE public.medicine_unit AS ENUM ('piece','ml','gram');
CREATE TYPE public.sale_type AS ENUM ('variable','fixed');

-- Add columns to products
ALTER TABLE public.products
  ADD COLUMN medicine_type public.medicine_type NOT NULL DEFAULT 'tablet',
  ADD COLUMN unit public.medicine_unit NOT NULL DEFAULT 'piece',
  ADD COLUMN sale_type public.sale_type NOT NULL DEFAULT 'variable';

-- Allow decimal stock & quantity for ml/gram partial sales
ALTER TABLE public.products ALTER COLUMN stock TYPE numeric USING stock::numeric;
ALTER TABLE public.sale_items ALTER COLUMN quantity TYPE numeric USING quantity::numeric;
