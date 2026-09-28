begin;

do $migration$
declare
  v_definition text;
  v_before text;
  v_after text;
begin
  select pg_get_functiondef('public.submit_driver_delivery_result(uuid,text,text,numeric,text,text,date,uuid,jsonb,text)'::regprocedure)
    into v_definition;

  if position('v_delivery_tomorrow_new_cycle' in v_definition) > 0 then
    return;
  end if;

  v_before := '  v_event_type text;' || chr(10)
    || '  v_metadata jsonb;' || chr(10)
    || '  v_submission_mode text := upper(trim(COALESCE(p_submission_mode, ''NEW'')));' || chr(10)
    || 'BEGIN';
  v_after := '  v_event_type text;' || chr(10)
    || '  v_metadata jsonb;' || chr(10)
    || '  v_submission_mode text := upper(trim(COALESCE(p_submission_mode, ''NEW'')));' || chr(10)
    || '  v_delivery_tomorrow_new_cycle boolean := false;' || chr(10)
    || 'BEGIN';
  if position(v_before in v_definition) = 0 then
    raise exception 'Could not locate submit_driver_delivery_result declaration block';
  end if;
  v_definition := replace(v_definition, v_before, v_after);

  v_before := '  IF v_order.driver_assignment_batch_id IS NULL THEN' || chr(10)
    || '    RAISE EXCEPTION ''This order has no active Driver assignment'';' || chr(10)
    || '  END IF;' || chr(10) || chr(10);
  v_after := v_before
    || '  v_delivery_tomorrow_new_cycle :=' || chr(10)
    || '    v_submission_mode = ''NEW''' || chr(10)
    || '    AND v_order.status::text = ''READY''' || chr(10)
    || '    AND v_order.current_operational_state::text = ''READY''' || chr(10)
    || '    AND v_order.driver_status::text = ''DRIVER_FAILED''' || chr(10)
    || '    AND lower(regexp_replace(trim(coalesce(v_order.driver_failed_reason, '''')), ''\s+'', '' '', ''g'')) = ''delivery tomorrow''' || chr(10)
    || '    AND v_order.runner_status::text IN (''ASSIGNED'', ''TAKEN'')' || chr(10)
    || '    AND coalesce(v_order.runner_accept_status::text, ''PENDING'') = ''ACCEPTED''' || chr(10)
    || '    AND coalesce(v_order.runner_review_status::text, ''NOT_REVIEWED'') = ''REVIEWED''' || chr(10)
    || '    AND coalesce(v_order.salesperson_action_required, false) IS NOT TRUE' || chr(10)
    || '    AND coalesce(v_order.runner_final_outcome::text, '''') NOT IN (''NEED_SALESPERSON_FOLLOWUP'', ''DELIVERED'', ''FAILED_DELIVERY'')' || chr(10)
    || '    AND v_order.driver_next_delivery_date IS NOT NULL' || chr(10)
    || '    AND v_order.driver_next_delivery_date <= v_today;' || chr(10) || chr(10);
  if position(v_before in v_definition) = 0 then
    raise exception 'Could not locate active Driver assignment guard';
  end if;
  v_definition := replace(v_definition, v_before, v_after);

  v_before := '  IF COALESCE(v_order.runner_accept_status::text, ''PENDING'') = ''ACCEPTED''' || chr(10)
    || '    OR COALESCE(v_order.runner_review_status::text, ''NOT_REVIEWED'') = ''REVIEWED''' || chr(10)
    || '  THEN';
  v_after := '  IF (' || chr(10)
    || '    COALESCE(v_order.runner_accept_status::text, ''PENDING'') = ''ACCEPTED''' || chr(10)
    || '    OR COALESCE(v_order.runner_review_status::text, ''NOT_REVIEWED'') = ''REVIEWED''' || chr(10)
    || '  ) AND NOT v_delivery_tomorrow_new_cycle THEN';
  if position(v_before in v_definition) = 0 then
    raise exception 'Could not locate reviewed Driver outcome guard';
  end if;
  v_definition := replace(v_definition, v_before, v_after);

  v_before := '  IF v_submission_mode = ''NEW''' || chr(10)
    || '    AND v_order.driver_status = ''DRIVER_FAILED''' || chr(10)
    || '    AND v_result_type <> ''DRIVER_DELIVERED_SUBMITTED''' || chr(10)
    || '  THEN';
  v_after := '  IF v_submission_mode = ''NEW''' || chr(10)
    || '    AND v_order.driver_status = ''DRIVER_FAILED''' || chr(10)
    || '    AND v_result_type <> ''DRIVER_DELIVERED_SUBMITTED''' || chr(10)
    || '    AND NOT v_delivery_tomorrow_new_cycle' || chr(10)
    || '  THEN';
  if position(v_before in v_definition) = 0 then
    raise exception 'Could not locate pending failed Driver outcome guard';
  end if;
  v_definition := replace(v_definition, v_before, v_after);

  execute v_definition;
end;
$migration$;

comment on function public.submit_driver_delivery_result(uuid,text,text,numeric,text,text,date,uuid,jsonb,text)
  is 'Submits a Driver delivery result; allows the next due action only for an accepted, reviewed Delivery Tomorrow order that remains READY.';

commit;
