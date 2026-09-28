-- The assistant wrapper declares the extra order status column. Return the
-- base delivered rows plus that column instead of SELECT * with 21 columns.
DO $$
DECLARE
  v_signature regprocedure := 'public.get_runner_assistant_delivered_orders(uuid,uuid,uuid[],integer,integer)'::regprocedure;
  v_definition text;
  v_rewritten text;
BEGIN
  SELECT pg_get_functiondef(v_signature)
  INTO v_definition;

  v_rewritten := replace(
    v_definition,
    $needle$  RETURN QUERY
  SELECT *
  FROM public.get_delivered_orders_fast(
    p_runner_id,
    p_salesperson_id,
    p_salesperson_ids,
    p_limit,
    p_offset
  );$needle$,
    $replacement$  RETURN QUERY
  SELECT delivered.*, o.status::text
  FROM public.get_delivered_orders_fast(
    p_runner_id,
    p_salesperson_id,
    p_salesperson_ids,
    p_limit,
    p_offset
  ) AS delivered
  JOIN public.orders o ON o.id = delivered.id;$replacement$
  );

  IF v_rewritten = v_definition THEN
    IF strpos(v_definition, 'SELECT delivered.*, o.status::text') > 0 THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'Expected assistant delivered return query was not found';
  END IF;

  EXECUTE v_rewritten;
END;
$$;

NOTIFY pgrst, 'reload schema';
