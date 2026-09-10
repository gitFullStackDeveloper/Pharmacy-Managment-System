DROP POLICY IF EXISTS "Authenticated insert sale_items" ON public.sale_items;
CREATE POLICY "Cashier insert own sale_items" ON public.sale_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_id AND s.cashier_id = auth.uid()));