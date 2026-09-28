BEGIN;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS import_fingerprint text;

CREATE OR REPLACE FUNCTION public.import_order_with_payment(p_order jsonb, p_items jsonb, p_transfer_amount numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_id uuid := (p_order->>'id')::uuid;
  v_existing public.orders%ROWTYPE;
  v_order jsonb;
  v_item jsonb;
  v_total numeric := 0;
  v_qty integer := 0;
  v_amount numeric;
  v_item_qty numeric;
  v_fingerprint text := md5(jsonb_build_object('order',p_order,'items',p_items,'transfer',p_transfer_amount)::text);
BEGIN
  IF auth.uid() IS NULL OR v_id IS NULL THEN RAISE EXCEPTION 'Authenticated import and request ID required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_id::text, 0));
  SELECT * INTO v_existing FROM public.orders WHERE id = v_id;
  IF FOUND THEN
    IF v_existing.created_by_user_id = auth.uid() AND v_existing.import_fingerprint = v_fingerprint THEN
      RETURN to_jsonb(v_existing);
    END IF;
    RAISE EXCEPTION 'This request ID was already used. Reopen the form before submitting changed data.';
  END IF;
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one SKU is required';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_items) x GROUP BY x->>'product_id' HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Duplicate SKU in order';
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_item_qty := (v_item->>'qty')::numeric;
    v_amount := (v_item->>'line_total')::numeric;
    IF v_item_qty IS NULL OR v_item_qty < 1 OR v_item_qty > 99999 OR v_item_qty <> trunc(v_item_qty)
       OR v_amount IS NULL OR v_amount < 0 OR v_amount > 999999999 OR v_amount <> round(v_amount,2)
       OR v_amount::text IN ('NaN','Infinity','-Infinity') OR v_item_qty::text IN ('NaN','Infinity','-Infinity') THEN
      RAISE EXCEPTION 'Invalid quantity or line total';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = (v_item->>'product_id')::uuid AND is_active
      AND (owner_user_id IS NULL OR owner_user_id = COALESCE((p_order->>'order_owner_id')::uuid,auth.uid()))) THEN
      RAISE EXCEPTION 'SKU is not available to the selected order owner';
    END IF;
    v_total := v_total + v_amount;
    v_qty := v_qty + v_item_qty::integer;
  END LOOP;
  v_order := public.create_order_with_payment(p_order || jsonb_build_object('total_amount',v_total,'total_qty',v_qty),p_transfer_amount);
  -- A single statement makes every row visible to the existing total-recalculation triggers.
  INSERT INTO public.order_items(order_id,product_id,sku_label,qty,price,line_total,notes)
  SELECT v_id,(x->>'product_id')::uuid,x->>'sku_label',(x->>'qty')::integer,
    (x->>'line_total')::numeric,(x->>'line_total')::numeric,COALESCE(x->>'notes','')
  FROM jsonb_array_elements(p_items) x;
  UPDATE public.orders SET import_fingerprint=v_fingerprint WHERE id=v_id RETURNING * INTO v_existing;
  RETURN to_jsonb(v_existing);
END;
$$;
REVOKE ALL ON FUNCTION public.import_order_with_payment(jsonb,jsonb,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.import_order_with_payment(jsonb,jsonb,numeric) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
