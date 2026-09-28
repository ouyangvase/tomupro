BEGIN;

-- Every Driver failed-delivery outcome must have an uploaded delivery photo.
-- This is enforced at the delivery-attempt boundary so clients cannot bypass
-- the requirement by calling the submission RPC without the UI.
CREATE OR REPLACE FUNCTION public.enforce_failed_delivery_photo_requirement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.result_type <> 'DRIVER_DELIVERED_SUBMITTED' THEN
    IF jsonb_typeof(COALESCE(NEW.proof_images, '[]'::jsonb)) <> 'array' THEN
      RAISE EXCEPTION 'At least one delivery photo is required for a failed-delivery submission';
    END IF;

    IF jsonb_array_length(COALESCE(NEW.proof_images, '[]'::jsonb)) < 1 THEN
      RAISE EXCEPTION 'At least one delivery photo is required for a failed-delivery submission';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(COALESCE(NEW.proof_images, '[]'::jsonb)) AS proof(value)
      JOIN public.attachments AS attachment
        ON attachment.order_id = NEW.order_id
       AND attachment.type = 'delivery_photo'::public.attachment_type
       AND attachment.uploaded_by = NEW.driver_id
       AND attachment.url = NULLIF(trim(proof.value), '')
      WHERE NULLIF(trim(proof.value), '') IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'At least one uploaded delivery photo is required for a failed-delivery submission';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS enforce_failed_delivery_photo_requirement ON public.delivery_attempts;
CREATE TRIGGER enforce_failed_delivery_photo_requirement
  BEFORE INSERT ON public.delivery_attempts
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_failed_delivery_photo_requirement();

REVOKE ALL ON FUNCTION public.enforce_failed_delivery_photo_requirement() FROM PUBLIC;

COMMIT;
