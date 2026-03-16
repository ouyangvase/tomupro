CREATE OR REPLACE FUNCTION resolve_event_audience_and_deliver(p_event_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule RECORD;
  v_include_ids uuid[] := '{}';
  v_exclude_ids uuid[] := '{}';
  v_final_ids uuid[];
  v_count integer := 0;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can resolve event audience';
  END IF;

  FOR v_rule IN
    SELECT * FROM event_audience_rules WHERE event_id = p_event_id
  LOOP
    IF v_rule.audience_type = 'all' THEN
      IF v_rule.rule_type = 'include' THEN
        v_include_ids := v_include_ids || ARRAY(SELECT id FROM profiles WHERE is_active = true);
      ELSE
        v_exclude_ids := v_exclude_ids || ARRAY(SELECT id FROM profiles WHERE is_active = true);
      END IF;
    ELSIF v_rule.audience_type = 'role' THEN
      IF v_rule.rule_type = 'include' THEN
        v_include_ids := v_include_ids || ARRAY(SELECT user_id FROM user_roles WHERE role = v_rule.audience_value::app_role);
      ELSE
        v_exclude_ids := v_exclude_ids || ARRAY(SELECT user_id FROM user_roles WHERE role = v_rule.audience_value::app_role);
      END IF;
    ELSIF v_rule.audience_type = 'user' THEN
      IF v_rule.rule_type = 'include' THEN
        v_include_ids := v_include_ids || v_rule.audience_value::uuid;
      ELSE
        v_exclude_ids := v_exclude_ids || v_rule.audience_value::uuid;
      END IF;
    ELSIF v_rule.audience_type = 'manager_group' THEN
      IF v_rule.rule_type = 'include' THEN
        v_include_ids := v_include_ids || ARRAY(SELECT member_user_id FROM group_members WHERE group_id = v_rule.audience_value::uuid);
      ELSE
        v_exclude_ids := v_exclude_ids || ARRAY(SELECT member_user_id FROM group_members WHERE group_id = v_rule.audience_value::uuid);
      END IF;
    END IF;
  END LOOP;

  SELECT ARRAY(
    SELECT DISTINCT unnest FROM unnest(v_include_ids)
    WHERE unnest != ALL(v_exclude_ids)
  ) INTO v_final_ids;

  IF array_length(v_final_ids, 1) IS NOT NULL THEN
    INSERT INTO event_user_delivery (event_id, user_id, delivered_at, current_status)
    SELECT p_event_id, uid, now(), 'delivered'
    FROM unnest(v_final_ids) AS uid
    ON CONFLICT (event_id, user_id) DO NOTHING;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;

  RETURN v_count;
END;
$$;