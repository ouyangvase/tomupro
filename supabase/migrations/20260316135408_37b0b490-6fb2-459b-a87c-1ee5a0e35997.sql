
-- 1. Server-side function to resolve audience and create delivery records
CREATE OR REPLACE FUNCTION public.resolve_event_audience_and_deliver(p_event_id uuid)
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
        v_include_ids := v_include_ids || ARRAY(SELECT id FROM profiles WHERE is_disabled = false);
      ELSE
        v_exclude_ids := v_exclude_ids || ARRAY(SELECT id FROM profiles WHERE is_disabled = false);
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

-- 2. User-facing function to get active popup events
CREATE OR REPLACE FUNCTION public.get_my_active_popup_events()
RETURNS TABLE (
  delivery_id uuid,
  event_id uuid,
  delivered_at timestamptz,
  seen_at timestamptz,
  dismissed_at timestamptz,
  current_status text,
  popup_shown_count integer,
  event_title text,
  event_subtitle text,
  event_description text,
  event_type text,
  event_cover_image_url text,
  show_as_popup boolean,
  dismissible boolean,
  force_acknowledge boolean,
  require_response boolean,
  allow_maybe boolean,
  event_start_at timestamptz,
  event_end_at timestamptz,
  event_location text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    eud.id AS delivery_id,
    e.id AS event_id,
    eud.delivered_at,
    eud.seen_at,
    eud.dismissed_at,
    eud.current_status,
    eud.popup_shown_count,
    e.title AS event_title,
    e.subtitle AS event_subtitle,
    e.description AS event_description,
    e.type AS event_type,
    e.cover_image_url AS event_cover_image_url,
    es.show_as_popup,
    es.dismissible,
    es.force_acknowledge,
    es.require_response,
    es.allow_maybe,
    es.event_start_at,
    es.event_end_at,
    es.event_location
  FROM event_user_delivery eud
  JOIN events e ON e.id = eud.event_id
  JOIN event_settings es ON es.event_id = e.id
  WHERE eud.user_id = auth.uid()
    AND eud.dismissed_at IS NULL
    AND eud.current_status IN ('delivered', 'seen')
    AND e.status = 'published'
    AND (e.publish_at IS NULL OR e.publish_at <= now())
    AND (e.expire_at IS NULL OR e.expire_at > now())
    AND es.show_as_popup = true
  ORDER BY eud.delivered_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_event_audience_and_deliver(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_active_popup_events() TO authenticated;
