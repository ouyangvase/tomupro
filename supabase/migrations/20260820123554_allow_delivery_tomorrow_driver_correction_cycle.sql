begin;

do $migration$
declare
  v_definition text;
  v_before text;
  v_after text;
begin
  select pg_get_functiondef('public.submit_driver_delivery_result(uuid,text,text,numeric,text,text,date,uuid,jsonb,text)'::regprocedure)
    into v_definition;

  if position('v_submission_mode IN (''NEW'', ''CORRECTION'')' in v_definition) > 0 then
    return;
  end if;

  v_before := '    v_submission_mode = ''NEW''' || chr(10)
    || '    AND v_order.status::text = ''READY''';
  v_after := '    v_submission_mode IN (''NEW'', ''CORRECTION'')' || chr(10)
    || '    AND v_order.status::text = ''READY''';
  if position(v_before in v_definition) = 0 then
    raise exception 'Could not locate Delivery Tomorrow cycle condition';
  end if;

  v_definition := replace(v_definition, v_before, v_after);
  execute v_definition;
end;
$migration$;

comment on function public.submit_driver_delivery_result(uuid,text,text,numeric,text,text,date,uuid,jsonb,text)
  is 'Submits a Driver delivery result; allows the next due action only for an accepted, reviewed Delivery Tomorrow order that remains READY.';

commit;
