-- Fix: Always validate warehouse is active before using cached fulfillment_warehouse_id
-- If cached warehouse is inactive/stale, recalculate using get_stock_owner_warehouse()
-- This prevents delivery failures when a user's role changes (e.g. salesperson → manager)

CREATE OR REPLACE FUNCTION public.process_delivery_queue_item()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_order RECORD;
  v_warehouse_id UUID;
  v_wh_active BOOLEAN;
  v_item RECORD;
  v_missing_items TEXT[];
  -- Webhook variables
  v_wh_url text;
  v_wh_secret text;
  v_wh_enabled boolean;
  v_idemp_key text;
  v_existing_wh_id uuid;
BEGIN
  SELECT o.id, o.salesperson_id, o.runner_id, o.order_code,
         o.fulfillment_warehouse_id, o.stock_deducted, o.delivered_at,
         o.customer_name, o.phone, o.address, o.area,
         o.payment_method, o.total_amount
  INTO v_order
  FROM orders o
  WHERE o.id = NEW.order_id;

  IF v_order IS NULL THEN
    UPDATE delivery_queue SET status = 'FAILED', error_message = 'Order not found', processed_at = NOW()
    WHERE id = NEW.id;
    RETURN NEW;
  END IF;

  IF v_order.stock_deducted THEN
    UPDATE delivery_queue SET status = 'COMPLETED', processed_at = NOW()
    WHERE id = NEW.id;
    RETURN NEW;
  END IF;

  -- WAREHOUSE LOOKUP: Always validate cached warehouse is active
  -- If stale/inactive, recalculate to prevent delivery failures after role changes
  v_warehouse_id := v_order.fulfillment_warehouse_id;

  IF v_warehouse_id IS NOT NULL THEN
    SELECT is_active INTO v_wh_active FROM warehouses WHERE id = v_warehouse_id;
    IF v_wh_active IS NULL OR NOT v_wh_active THEN
      -- Cached warehouse is inactive — must recalculate
      v_warehouse_id := NULL;
    END IF;
  END IF;

  IF v_warehouse_id IS NULL THEN
    -- Use the role-aware lookup (handles salesperson vs manager warehouse types)
    SELECT get_stock_owner_warehouse(NEW.order_id) INTO v_warehouse_id;
  END IF;

  IF v_warehouse_id IS NULL THEN
    -- Final fallback: direct query for any active warehouse owned by the salesperson
    SELECT id INTO v_warehouse_id
    FROM warehouses
    WHERE owner_user_id = v_order.salesperson_id
      AND warehouse_type IN ('SALESPERSON', 'MANAGER')
      AND is_active = true
    LIMIT 1;
  END IF;

  IF v_warehouse_id IS NULL THEN
    UPDATE delivery_queue SET status = 'FAILED', error_message = 'No active warehouse found for salesperson', processed_at = NOW()
    WHERE id = NEW.id;
    RETURN NEW;
  END IF;

  SELECT array_agg(COALESCE(sku_label, 'Unknown'))
  INTO v_missing_items
  FROM order_items
  WHERE order_id = NEW.order_id AND product_id IS NULL;

  IF array_length(v_missing_items, 1) > 0 THEN
    UPDATE orders SET
      reconciliation_status = 'DISPUTE',
      dispute_reason = 'Missing SKU mapping',
      dispute_notes = 'Missing SKU: ' || array_to_string(v_missing_items, ', ')
    WHERE id = NEW.order_id;

    UPDATE delivery_queue SET status = 'DISPUTE', error_message = 'Missing SKU mapping', processed_at = NOW()
    WHERE id = NEW.id;
    RETURN NEW;
  END IF;

  FOR v_item IN
    SELECT id, product_id, qty FROM order_items WHERE order_id = NEW.order_id AND product_id IS NOT NULL
  LOOP
    INSERT INTO stock_movements (
      warehouse_id, product_id, movement_type, qty_change,
      reference_type, reference_id, order_id, created_by
    )
    VALUES (
      v_warehouse_id, v_item.product_id, 'DELIVER_DEDUCT', -v_item.qty,
      'ORDER_ITEM', v_item.id, NEW.order_id, v_order.runner_id
    )
    ON CONFLICT DO NOTHING;
  END LOOP;

  UPDATE orders SET
    stock_deducted = true,
    inventory_deducted_at = NOW(),
    fulfillment_warehouse_id = v_warehouse_id
  WHERE id = NEW.order_id;

  UPDATE delivery_queue SET status = 'COMPLETED', processed_at = NOW()
  WHERE id = NEW.id;

  INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id)
  VALUES (
    v_order.salesperson_id,
    'DELIVERED',
    'Order Delivered',
    'Order ' || v_order.order_code || ' delivered. Stock deducted.',
    'ORDER',
    NEW.order_id
  );

  -- ============================================================
  -- WEBHOOK: Send order.delivered to PulseOne via pg_net
  -- ============================================================
  BEGIN
    SELECT webhook_url, shared_secret, webhook_enabled
      INTO v_wh_url, v_wh_secret, v_wh_enabled
      FROM integration_settings
     WHERE integration_name = 'pulseone';

    IF v_wh_url IS NOT NULL AND v_wh_enabled THEN
      DECLARE
        v_items jsonb;
        v_payload jsonb;
        v_payload_str text;
        v_signature text;
        v_headers jsonb;
      BEGIN
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'sku', COALESCE(p.sku_code, oi.sku_label),
          'product_name', COALESCE(p.sku_name, oi.sku_label, 'Unknown'),
          'qty', oi.qty,
          'unit_price', oi.price,
          'line_total', oi.line_total
        )), '[]'::jsonb)
        INTO v_items
        FROM order_items oi
        LEFT JOIN products p ON p.id = oi.product_id
        WHERE oi.order_id = NEW.order_id;

        v_payload := jsonb_build_object(
          'event_type', 'order.delivered',
          'occurred_at', COALESCE(v_order.delivered_at::text, to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
          'data', jsonb_build_object(
            'order_id', v_order.id::text,
            'order_ref', COALESCE(v_order.order_code, ''),
            'tracking_no', COALESCE(v_order.order_code, ''),
            'customer_name', COALESCE(v_order.customer_name, ''),
            'customer_phone', COALESCE(v_order.phone, ''),
            'full_address', COALESCE(v_order.address, ''),
            'area', COALESCE(v_order.area, ''),
            'payment_type', COALESCE(v_order.payment_method, ''),
            'order_total', COALESCE(v_order.total_amount, 0),
            'items', v_items,
            'source_system', 'tomu_pro'
          )
        );

        v_payload_str := v_payload::text;
        v_idemp_key := 'order.delivered:' || COALESCE(v_order.order_code, '') || ':' || v_order.id::text;

        SELECT id INTO v_existing_wh_id
          FROM webhook_logs
         WHERE idempotency_key = v_idemp_key
           AND sync_status = 'sent'
         LIMIT 1;

        IF v_existing_wh_id IS NULL THEN
          v_signature := encode(hmac(v_payload_str::bytea, COALESCE(v_wh_secret, '')::bytea, 'sha256'::text), 'hex');

          v_headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'X-Webhook-Event', 'order.delivered',
            'X-Webhook-Signature', v_signature,
            'x-webhook-secret', COALESCE(v_wh_secret, ''),
            'Idempotency-Key', v_idemp_key,
            'X-Source-System', 'TOMUPRO'
          );

          PERFORM net.http_post(
            url := v_wh_url,
            body := v_payload,
            headers := v_headers
          );

          INSERT INTO webhook_logs (
            event_type, order_ref, order_id, payload, sync_status,
            idempotency_key, sent_at, updated_at
          ) VALUES (
            'order.delivered',
            v_order.order_code,
            v_order.id,
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
        END IF;
      END;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO webhook_logs (
        event_type, order_ref, order_id, payload, sync_status,
        error_message, idempotency_key, updated_at
      ) VALUES (
        'order.delivered',
        v_order.order_code,
        v_order.id,
        jsonb_build_object('error_context', 'trigger_webhook_failed'),
        'failed',
        SQLERRM,
        'order.delivered:' || COALESCE(v_order.order_code, '') || ':' || v_order.id::text,
        now()
      )
      ON CONFLICT (idempotency_key) DO UPDATE SET
        sync_status = 'failed',
        error_message = SQLERRM,
        retry_count = webhook_logs.retry_count + 1,
        updated_at = now();
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END;

  RETURN NEW;
END;
$$;
