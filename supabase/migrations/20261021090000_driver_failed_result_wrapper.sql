-- Driver failed-delivery submissions still need the hardened delivery-result
-- implementation, but the client must not call that implementation directly.
-- Expose only the failed-result path to authenticated Drivers.
CREATE OR REPLACE FUNCTION public.submit_driver_failed_result(
  p_order_id uuid,
  p_result_type text,
  p_reason text DEFAULT NULL,
  p_remark text DEFAULT NULL,
  p_next_delivery_date date DEFAULT NULL,
  p_submission_id uuid DEFAULT gen_random_uuid(),
  p_proof_images jsonb DEFAULT '[]'::jsonb,
  p_submission_mode text DEFAULT 'NEW'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.get_user_role(auth.uid())::text <> 'driver' THEN
    RAISE EXCEPTION 'Only a Driver can submit failed delivery';
  END IF;

  IF upper(trim(COALESCE(p_result_type, ''))) NOT IN (
    'DRIVER_FAILED_SUBMITTED',
    'DRIVER_DELIVERY_TOMORROW_SUBMITTED',
    'DRIVER_RESCHEDULE_SUBMITTED'
  ) THEN
    RAISE EXCEPTION 'Invalid failed Driver delivery result type';
  END IF;

  RETURN public.submit_driver_delivery_result(
    p_order_id,
    p_result_type,
    NULL,
    NULL,
    p_reason,
    p_remark,
    p_next_delivery_date,
    p_submission_id,
    COALESCE(p_proof_images, '[]'::jsonb),
    p_submission_mode
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_driver_failed_result(
  uuid, text, text, text, date, uuid, jsonb, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_driver_failed_result(
  uuid, text, text, text, date, uuid, jsonb, text
) TO authenticated;

NOTIFY pgrst, 'reload schema';
