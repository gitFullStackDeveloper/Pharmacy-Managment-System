-- Add strength_value and strength_unit to products for variant sizing
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS strength_value numeric,
  ADD COLUMN IF NOT EXISTS strength_unit text;

-- Backfill from existing dosage_strength when possible (e.g. "500mg", "120 ml")
UPDATE public.products
SET 
  strength_value = COALESCE(strength_value, NULLIF(regexp_replace(dosage_strength, '[^0-9.]', '', 'g'), '')::numeric),
  strength_unit  = COALESCE(strength_unit, NULLIF(lower(regexp_replace(dosage_strength, '[0-9.\s]', '', 'g')), ''))
WHERE dosage_strength IS NOT NULL;