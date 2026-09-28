-- The existing integration_settings RLS policies already restrict this row
-- to administrators. The URL is stored in metadata so it can change without
-- a frontend deployment and without adding a new settings table.

CREATE OR REPLACE FUNCTION private.validate_tomupro_document_drive_setting()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_url text;
BEGIN
  IF NEW.integration_name = 'tomupro_documents' THEN
    v_url := btrim(COALESCE(NEW.metadata ->> 'document_drive_url', ''));
    IF v_url !~ '^https://[^[:space:]]+$' THEN
      RAISE EXCEPTION 'TOMUPRO document storage URL must be a valid HTTPS URL';
    END IF;
    NEW.metadata := jsonb_set(
      COALESCE(NEW.metadata, '{}'::jsonb),
      '{document_drive_url}',
      to_jsonb(v_url),
      true
    );
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS validate_tomupro_document_drive_setting ON public.integration_settings;
CREATE TRIGGER validate_tomupro_document_drive_setting
BEFORE INSERT OR UPDATE OF integration_name, metadata
ON public.integration_settings
FOR EACH ROW
EXECUTE FUNCTION private.validate_tomupro_document_drive_setting();

INSERT INTO public.integration_settings (
  integration_name,
  webhook_enabled,
  metadata
)
VALUES (
  'tomupro_documents',
  false,
  jsonb_build_object(
    'document_drive_url',
    'https://drive.google.com/drive/folders/13Y3Gs7fNK6vjUcaIRVgJdah6E3sHXqTZ'
  )
)
ON CONFLICT (integration_name) DO UPDATE
SET metadata = CASE
  WHEN COALESCE(integration_settings.metadata, '{}'::jsonb) ? 'document_drive_url'
    THEN integration_settings.metadata
  ELSE COALESCE(integration_settings.metadata, '{}'::jsonb) || jsonb_build_object(
    'document_drive_url',
    'https://drive.google.com/drive/folders/13Y3Gs7fNK6vjUcaIRVgJdah6E3sHXqTZ'
  )
END;
