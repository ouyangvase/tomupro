-- Fix: HMAC signing error in notify_inbound_acknowledged()
-- Error was: function hmac(text, text, unknown) does not exist
-- Root cause: pgcrypto is in 'extensions' schema, not in function's search_path
-- Fix: schema-qualify hmac() call as extensions.hmac()

CREATE OR REPLACE FUNCTION notify_inbound_acknowledged()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $f$
DECLARE
  v_wh_url text;
  v_wh_secret text;
  v_wh_enabled boolean;
  v_tracking text;
  v_runner_id uuid;
  v_sp_id uuid;
  v_runner_name text;
  v_sp_name text;
  v_payload jsonb;
  v_payload_str text;
  v_signature text;
  v_idemp_key text;
  v_existing_id uuid;
  v_headers jsonb;
BEGIN
  -- Get PulseControl webhook settings
  SELECT webhook_url, shared_secret, webhook_enabled
    INTO v_wh_url, v_wh_secret, v_wh_enabled
    FROM integration_settings
   WHERE integration_name = 'pulsecontrol';

  IF v_wh_url IS NULL OR NOT v_wh_enabled THEN
    RETURN NEW;
  END IF;

  -- Get shipment details
  SELECT tracking_no, runner_id, salesperson_id
    INTO v_tracking, v_runner_id, v_sp_id
    FROM inbound_shipments
   WHERE id = NEW.id;

  -- Get display names
  SELECT COALESCE(display_name, 'Unknown') INTO v_runner_name
    FROM user_directory WHERE id = v_runner_id;
  SELECT COALESCE(display_name, 'Unknown') INTO v_sp_name
    FROM user_directory WHERE id = v_sp_id;

  -- Build idempotency key
  v_idemp_key := 'inbound_acknowledged:' || COALESCE(v_tracking,'') || ':' || NEW.id::text;

  -- Check idempotency
  SELECT id INTO v_existing_id
    FROM webhook_logs
   WHERE idempotency_key = v_idemp_key
     AND sync_status = 'sent'
   LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Build payload
  v_payload := jsonb_build_object(
    'event', 'inbound_acknowledged',
    'tracking_no', COALESCE(v_tracking, ''),
    'status', 'ACKNOWLEDGED',
    'accepted_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'runner', COALESCE(v_runner_name, 'Unknown'),
    'target_user', COALESCE(v_sp_name, 'Unknown'),
    'target_user_id', COALESCE(v_sp_id::text, ''),
    'shipment_id', NEW.id::text
  );

  v_payload_str := v_payload::text;

  -- HMAC-SHA256 signature (extensions.hmac from pgcrypto)
  v_signature := encode(hmac(v_payload_str::bytea, COALESCE(v_wh_secret, '')::bytea, 'sha256'::text), 'hex');

  -- Build headers
  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'X-Webhook-Event', 'inbound_acknowledged',
    'X-Webhook-Signature', v_signature,
    'x-webhook-secret', COALESCE(v_wh_secret, ''),
    'Idempotency-Key', v_idemp_key,
    'X-Source-System', 'TOMUPRO'
  );

  -- Send via pg_net (async, non-blocking)
  PERFORM net.http_post(
    url := v_wh_url,
    body := v_payload,
    headers := v_headers
  );

  -- Log to webhook_logs
  INSERT INTO webhook_logs (
    event_type, order_ref, payload, sync_status,
    idempotency_key, sent_at, updated_at
  ) VALUES (
    'inbound_acknowledged',
    v_tracking,
    v_payload,
    'sent',
    v_idemp_key,
    now(),
    now()
  )
  ON CONFLICT (idempotency_key) DO UPDATE SET
    sync_status = 'sent',
    sent_at = now(),
    updated_at = now();

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log failure but don't block the transaction
  BEGIN
    INSERT INTO webhook_logs (
      event_type, order_ref, payload, sync_status,
      error_message, idempotency_key, updated_at
    ) VALUES (
      'inbound_acknowledged',
      v_tracking,
      v_payload,
      'failed',
      SQLERRM,
      v_idemp_key,
      now()
    )
    ON CONFLICT (idempotency_key) DO UPDATE SET
      sync_status = 'failed',
      error_message = SQLERRM,
      updated_at = now();
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NEW;
END;
$f$;
