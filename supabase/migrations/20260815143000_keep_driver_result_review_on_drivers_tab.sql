-- Runner Inbox delivery is only for a normal Runner delivery.
-- Driver-delivered/failed evidence must be accepted or rejected from the
-- canonical Dispatch > Drivers review flow.
DO $$
DECLARE
  v_definition text;
  v_rewritten text;
  v_anchor text := E'  IF v_order.order_type = ''MIRI_INBOUND_PICKUP'' THEN';
  v_guard text := E'  IF v_order.driver_status IN (''DRIVER_DELIVERED'', ''DRIVER_FAILED'') THEN\n    RETURN jsonb_build_object(''success'', false, ''error'', ''Driver results must be reviewed from Dispatch > Drivers'');\n  END IF;\n\n  IF v_order.order_type = ''MIRI_INBOUND_PICKUP'' THEN';
  v_old text := E'  IF v_order.driver_status = ''DRIVER_DELIVERED'' THEN\n    RETURN public.review_driver_delivery(p_order_id, p_actor_id, true, NULL);\n  END IF;';
  v_new text := E'  IF v_order.driver_status IN (''DRIVER_DELIVERED'', ''DRIVER_FAILED'') THEN\n    RETURN jsonb_build_object(''success'', false, ''error'', ''Driver results must be reviewed from Dispatch > Drivers'');\n  END IF;';
BEGIN
  SELECT pg_get_functiondef(
    'public.mark_order_delivered_fast(uuid,uuid)'::regprocedure
  ) INTO v_definition;

  v_rewritten := replace(v_definition, v_anchor, v_guard);
  v_rewritten := replace(v_rewritten, v_old, v_new);

  IF v_rewritten <> v_definition THEN
    EXECUTE v_rewritten;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
