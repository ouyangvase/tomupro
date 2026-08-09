-- Keep delivery-charge history while allowing a runner to cancel only their own pending proposal.
ALTER TYPE public.delivery_charge_status ADD VALUE IF NOT EXISTS 'CANCELLED';

CREATE OR REPLACE FUNCTION public.cancel_delivery_charge_proposal(p_charge_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.delivery_charges
  SET
    status = 'CANCELLED',
    rejection_remark = 'Cancelled by runner',
    updated_at = now()
  WHERE id = p_charge_id
    AND runner_id = auth.uid()
    AND proposed_by = auth.uid()
    AND status = 'PENDING';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending delivery charge proposal not found or not owned by current user';
  END IF;

  RETURN p_charge_id;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_delivery_charge_proposal(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_delivery_charge_proposal(UUID) TO authenticated;
