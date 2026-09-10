ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_piece_able boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS dosage_strength text;

UPDATE public.products
SET is_piece_able = (sale_type = 'variable');