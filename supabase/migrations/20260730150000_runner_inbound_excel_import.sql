-- Staged, idempotent Excel imports for the existing runner inbound workflow.
-- Import confirmation creates PENDING_SP_ACK shipments/items only. Stock remains
-- exclusively owned by ack_inbound_and_add_stock after recipient acknowledgement.

CREATE TABLE IF NOT EXISTS public.inbound_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  runner_id uuid NOT NULL REFERENCES public.profiles(id),
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  file_name text NOT NULL,
  file_hash text NOT NULL,
  status text NOT NULL DEFAULT 'STAGED'
    CHECK (status IN ('STAGED', 'CONFIRMED', 'FAILED', 'CANCELLED')),
  row_count integer NOT NULL DEFAULT 0,
  valid_count integer NOT NULL DEFAULT 0,
  invalid_count integer NOT NULL DEFAULT 0,
  excluded_count integer NOT NULL DEFAULT 0,
  confirmation_result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  UNIQUE (runner_id, file_hash)
);

CREATE TABLE IF NOT EXISTS public.inbound_import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.inbound_import_batches(id) ON DELETE CASCADE,
  row_number integer NOT NULL,
  username_raw text NOT NULL DEFAULT '',
  sku_raw text NOT NULL DEFAULT '',
  quantity_raw text NOT NULL DEFAULT '',
  inbound_date_raw text NOT NULL DEFAULT '',
  reference_number text NOT NULL DEFAULT '',
  remark text NOT NULL DEFAULT '',
  quantity integer,
  inbound_date date,
  matched_user_id uuid REFERENCES public.profiles(id),
  suggested_user_id uuid REFERENCES public.profiles(id),
  user_match_state text NOT NULL DEFAULT 'No Match',
  user_match_score integer NOT NULL DEFAULT 0,
  matched_product_id uuid REFERENCES public.products(id),
  suggested_product_id uuid REFERENCES public.products(id),
  product_match_state text NOT NULL DEFAULT 'No Match',
  product_match_score integer NOT NULL DEFAULT 0,
  user_confirmed boolean NOT NULL DEFAULT false,
  product_confirmed boolean NOT NULL DEFAULT false,
  duplicate_in_file boolean NOT NULL DEFAULT false,
  duplicate_existing boolean NOT NULL DEFAULT false,
  excluded boolean NOT NULL DEFAULT false,
  validation_state text NOT NULL DEFAULT 'INVALID'
    CHECK (validation_state IN ('VALID', 'NEEDS_REVIEW', 'INVALID', 'DUPLICATE', 'EXCLUDED')),
  validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_inbound_id uuid REFERENCES public.inbound_shipments(id),
  created_item_id uuid REFERENCES public.inbound_items(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, row_number)
);

CREATE INDEX IF NOT EXISTS idx_inbound_import_batches_runner_created
  ON public.inbound_import_batches (runner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbound_import_rows_batch_state
  ON public.inbound_import_rows (batch_id, validation_state, row_number);

ALTER TABLE public.inbound_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbound_import_rows ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_manage_inbound_import(p_runner_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND (
      public.get_user_role(auth.uid()) = 'admin'
      OR (
        auth.uid() = p_runner_id
        AND public.get_user_role(auth.uid()) = 'runner'
      )
      OR public.has_runner_assistant_permission(auth.uid(), p_runner_id, 'inbound_stock')
    );
$$;

REVOKE ALL ON FUNCTION public.can_manage_inbound_import(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_inbound_import(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.try_parse_inbound_iso_date(p_value text)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = public
AS $$
DECLARE
  v_date date;
BEGIN
  IF p_value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    RETURN NULL;
  END IF;

  v_date := p_value::date;
  IF to_char(v_date, 'YYYY-MM-DD') <> p_value THEN
    RETURN NULL;
  END IF;
  RETURN v_date;
EXCEPTION
  WHEN others THEN
    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.try_parse_inbound_iso_date(text) FROM PUBLIC, authenticated, anon;

DROP POLICY IF EXISTS "Authorized users can view inbound import batches"
  ON public.inbound_import_batches;
CREATE POLICY "Authorized users can view inbound import batches"
  ON public.inbound_import_batches
  FOR SELECT
  USING (public.can_manage_inbound_import(runner_id));

DROP POLICY IF EXISTS "Authorized users can view inbound import rows"
  ON public.inbound_import_rows;
CREATE POLICY "Authorized users can view inbound import rows"
  ON public.inbound_import_rows
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.inbound_import_batches batch
      WHERE batch.id = inbound_import_rows.batch_id
        AND public.can_manage_inbound_import(batch.runner_id)
    )
  );

GRANT SELECT ON public.inbound_import_batches TO authenticated;
GRANT SELECT ON public.inbound_import_rows TO authenticated;

CREATE OR REPLACE FUNCTION public.refresh_inbound_import_batch(p_batch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.inbound_import_rows
  SET duplicate_in_file = false,
      duplicate_existing = false
  WHERE batch_id = p_batch_id;

  UPDATE public.inbound_import_rows target
  SET duplicate_in_file = true
  WHERE target.id IN (
    SELECT ranked.id
    FROM (
      SELECT
        row_data.id,
        row_number() OVER (
          PARTITION BY
            regexp_replace(lower(trim(row_data.username_raw)), '[^a-z0-9]+', '', 'g'),
            regexp_replace(lower(trim(row_data.sku_raw)), '[^a-z0-9]+', '', 'g'),
            row_data.inbound_date_raw,
            lower(trim(row_data.reference_number))
          ORDER BY row_data.row_number
        ) AS duplicate_rank
      FROM public.inbound_import_rows row_data
      WHERE row_data.batch_id = p_batch_id
        AND NOT row_data.excluded
    ) ranked
    WHERE ranked.duplicate_rank > 1
  );

  UPDATE public.inbound_import_rows row_data
  SET duplicate_existing = EXISTS (
    SELECT 1
    FROM public.inbound_shipments shipment
    JOIN public.inbound_items item ON item.inbound_id = shipment.id
    WHERE shipment.salesperson_id = row_data.matched_user_id
      AND item.product_id = row_data.matched_product_id
      AND shipment.arrival_date = row_data.inbound_date
      AND lower(trim(shipment.tracking_no)) = lower(trim(row_data.reference_number))
      AND item.qty_reported = row_data.quantity
  )
  WHERE row_data.batch_id = p_batch_id
    AND row_data.reference_number <> ''
    AND row_data.matched_user_id IS NOT NULL
    AND row_data.matched_product_id IS NOT NULL
    AND row_data.quantity IS NOT NULL
    AND row_data.inbound_date IS NOT NULL;

  UPDATE public.inbound_import_rows row_data
  SET
    validation_state = CASE
      WHEN row_data.excluded THEN 'EXCLUDED'
      WHEN row_data.username_raw = ''
        OR row_data.sku_raw = ''
        OR row_data.quantity IS NULL
        OR row_data.quantity <= 0
        OR row_data.inbound_date IS NULL
        THEN 'INVALID'
      WHEN row_data.duplicate_in_file OR row_data.duplicate_existing THEN 'DUPLICATE'
      WHEN row_data.matched_user_id IS NULL OR row_data.matched_product_id IS NULL
        THEN 'NEEDS_REVIEW'
      ELSE 'VALID'
    END,
    validation_errors =
      CASE WHEN row_data.username_raw = '' THEN '["Username is required"]'::jsonb ELSE '[]'::jsonb END
      || CASE WHEN row_data.sku_raw = '' THEN '["SKU Code is required"]'::jsonb ELSE '[]'::jsonb END
      || CASE WHEN row_data.quantity IS NULL OR row_data.quantity <= 0
        THEN '["Quantity must be a positive whole number"]'::jsonb ELSE '[]'::jsonb END
      || CASE WHEN row_data.inbound_date IS NULL
        THEN '["Inbound Date must use YYYY-MM-DD"]'::jsonb ELSE '[]'::jsonb END
      || CASE WHEN row_data.duplicate_in_file
        THEN '["Duplicate row in this file"]'::jsonb ELSE '[]'::jsonb END
      || CASE WHEN row_data.duplicate_existing
        THEN '["Matching inbound record already exists"]'::jsonb ELSE '[]'::jsonb END
      || CASE WHEN row_data.username_raw <> '' AND row_data.matched_user_id IS NULL
        THEN '["Confirm the receiving user"]'::jsonb ELSE '[]'::jsonb END
      || CASE WHEN row_data.sku_raw <> '' AND row_data.matched_product_id IS NULL
        THEN '["Confirm the product"]'::jsonb ELSE '[]'::jsonb END
  WHERE row_data.batch_id = p_batch_id;

  UPDATE public.inbound_import_batches batch
  SET
    row_count = counts.row_count,
    valid_count = counts.valid_count,
    invalid_count = counts.invalid_count,
    excluded_count = counts.excluded_count
  FROM (
    SELECT
      count(*)::integer AS row_count,
      count(*) FILTER (WHERE validation_state = 'VALID')::integer AS valid_count,
      count(*) FILTER (WHERE validation_state IN ('INVALID', 'NEEDS_REVIEW', 'DUPLICATE'))::integer AS invalid_count,
      count(*) FILTER (WHERE validation_state = 'EXCLUDED')::integer AS excluded_count
    FROM public.inbound_import_rows
    WHERE batch_id = p_batch_id
  ) counts
  WHERE batch.id = p_batch_id;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_inbound_import_batch(uuid) FROM PUBLIC, authenticated, anon;

CREATE OR REPLACE FUNCTION public.prepare_inbound_import(
  p_runner_id uuid,
  p_file_name text,
  p_file_hash text,
  p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch public.inbound_import_batches%ROWTYPE;
  v_row jsonb;
  v_user_id uuid;
  v_suggested_user_id uuid;
  v_product_id uuid;
  v_suggested_product_id uuid;
  v_quantity integer;
  v_date date;
  v_row_number integer;
  v_user_match_score integer;
  v_product_match_score integer;
  v_uuid_pattern constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$';
BEGIN
  IF NOT public.can_manage_inbound_import(p_runner_id) THEN
    RAISE EXCEPTION 'Not authorized to import inbound stock for this runner';
  END IF;

  IF jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'Import rows must be a JSON array';
  END IF;

  IF jsonb_array_length(p_rows) = 0 OR jsonb_array_length(p_rows) > 2000 THEN
    RAISE EXCEPTION 'Import must contain between 1 and 2000 rows';
  END IF;

  IF coalesce(trim(p_file_name), '') = '' OR coalesce(trim(p_file_hash), '') = '' THEN
    RAISE EXCEPTION 'File name and file hash are required';
  END IF;

  SELECT * INTO v_batch
  FROM public.inbound_import_batches
  WHERE runner_id = p_runner_id
    AND file_hash = p_file_hash
  LIMIT 1;

  IF v_batch.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'batch_id', v_batch.id,
      'status', v_batch.status,
      'reused', true,
      'row_count', v_batch.row_count,
      'valid_count', v_batch.valid_count,
      'invalid_count', v_batch.invalid_count,
      'excluded_count', v_batch.excluded_count,
      'confirmation_result', v_batch.confirmation_result
    );
  END IF;

  INSERT INTO public.inbound_import_batches (
    runner_id,
    created_by,
    file_name,
    file_hash
  )
  VALUES (
    p_runner_id,
    auth.uid(),
    left(trim(p_file_name), 255),
    left(trim(p_file_hash), 128)
  )
  RETURNING * INTO v_batch;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_user_id := CASE
      WHEN coalesce(v_row->>'matched_user_id', '') ~* v_uuid_pattern
        THEN (v_row->>'matched_user_id')::uuid
      ELSE NULL
    END;
    v_suggested_user_id := CASE
      WHEN coalesce(v_row->>'suggested_user_id', '') ~* v_uuid_pattern
        THEN (v_row->>'suggested_user_id')::uuid
      ELSE NULL
    END;
    v_product_id := CASE
      WHEN coalesce(v_row->>'matched_product_id', '') ~* v_uuid_pattern
        THEN (v_row->>'matched_product_id')::uuid
      ELSE NULL
    END;
    v_suggested_product_id := CASE
      WHEN coalesce(v_row->>'suggested_product_id', '') ~* v_uuid_pattern
        THEN (v_row->>'suggested_product_id')::uuid
      ELSE NULL
    END;

    IF v_user_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM public.v_runner_target_users target
      WHERE target.runner_id = p_runner_id
        AND target.user_id = v_user_id
    ) THEN
      v_user_id := NULL;
    END IF;

    IF v_suggested_user_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM public.v_runner_target_users target
      WHERE target.runner_id = p_runner_id
        AND target.user_id = v_suggested_user_id
    ) THEN
      v_suggested_user_id := NULL;
    END IF;

    IF v_product_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM public.products product
      WHERE product.id = v_product_id
        AND product.owner_user_id = v_user_id
        AND product.is_active
    ) THEN
      v_product_id := NULL;
    END IF;

    IF v_suggested_product_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM public.products product
      WHERE product.id = v_suggested_product_id
        AND product.owner_user_id = coalesce(v_user_id, v_suggested_user_id)
        AND product.is_active
    ) THEN
      v_suggested_product_id := NULL;
    END IF;

    v_quantity := CASE
      WHEN length(coalesce(v_row->>'quantity_raw', '')) <= 10
        AND coalesce(v_row->>'quantity_raw', '') ~ '^[0-9]+$'
        AND (v_row->>'quantity_raw')::numeric <= 2147483647
        THEN (v_row->>'quantity_raw')::integer
      ELSE NULL
    END;

    v_date := public.try_parse_inbound_iso_date(v_row->>'inbound_date_raw');
    v_row_number := CASE
      WHEN length(coalesce(v_row->>'row_number', '')) <= 10
        AND coalesce(v_row->>'row_number', '') ~ '^[0-9]+$'
        AND (v_row->>'row_number')::numeric <= 2147483647
        THEN greatest((v_row->>'row_number')::integer, 2)
      ELSE 2
    END;
    v_user_match_score := CASE
      WHEN length(coalesce(v_row->>'user_match_score', '')) <= 3
        AND coalesce(v_row->>'user_match_score', '') ~ '^[0-9]+$'
        THEN greatest(0, least(100, (v_row->>'user_match_score')::integer))
      ELSE 0
    END;
    v_product_match_score := CASE
      WHEN length(coalesce(v_row->>'product_match_score', '')) <= 3
        AND coalesce(v_row->>'product_match_score', '') ~ '^[0-9]+$'
        THEN greatest(0, least(100, (v_row->>'product_match_score')::integer))
      ELSE 0
    END;

    INSERT INTO public.inbound_import_rows (
      batch_id,
      row_number,
      username_raw,
      sku_raw,
      quantity_raw,
      inbound_date_raw,
      reference_number,
      remark,
      quantity,
      inbound_date,
      matched_user_id,
      suggested_user_id,
      user_match_state,
      user_match_score,
      matched_product_id,
      suggested_product_id,
      product_match_state,
      product_match_score
    )
    VALUES (
      v_batch.id,
      v_row_number,
      left(trim(coalesce(v_row->>'username_raw', '')), 255),
      left(trim(coalesce(v_row->>'sku_raw', '')), 255),
      left(trim(coalesce(v_row->>'quantity_raw', '')), 64),
      left(trim(coalesce(v_row->>'inbound_date_raw', '')), 64),
      left(trim(coalesce(v_row->>'reference_number', '')), 255),
      left(trim(coalesce(v_row->>'remark', '')), 2000),
      v_quantity,
      v_date,
      v_user_id,
      v_suggested_user_id,
      left(coalesce(v_row->>'user_match_state', 'No Match'), 32),
      v_user_match_score,
      v_product_id,
      v_suggested_product_id,
      left(coalesce(v_row->>'product_match_state', 'No Match'), 32),
      v_product_match_score
    );
  END LOOP;

  PERFORM public.refresh_inbound_import_batch(v_batch.id);

  INSERT INTO public.audit_logs (
    entity_type,
    entity_id,
    action,
    actor_id,
    after_json
  )
  SELECT
    'inbound_import_batch',
    batch.id,
    'INBOUND_IMPORT_STAGED',
    auth.uid(),
    jsonb_build_object(
      'runner_id', batch.runner_id,
      'file_name', batch.file_name,
      'row_count', batch.row_count,
      'valid_count', batch.valid_count,
      'invalid_count', batch.invalid_count
    )
  FROM public.inbound_import_batches batch
  WHERE batch.id = v_batch.id;

  SELECT * INTO v_batch
  FROM public.inbound_import_batches
  WHERE id = v_batch.id;

  RETURN jsonb_build_object(
    'batch_id', v_batch.id,
    'status', v_batch.status,
    'reused', false,
    'row_count', v_batch.row_count,
    'valid_count', v_batch.valid_count,
    'invalid_count', v_batch.invalid_count,
    'excluded_count', v_batch.excluded_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_inbound_import_row(
  p_row_id uuid,
  p_user_id uuid,
  p_product_id uuid,
  p_excluded boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.inbound_import_rows%ROWTYPE;
  v_batch public.inbound_import_batches%ROWTYPE;
BEGIN
  SELECT row_data.* INTO v_row
  FROM public.inbound_import_rows row_data
  WHERE row_data.id = p_row_id;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Import row not found';
  END IF;

  SELECT * INTO v_batch
  FROM public.inbound_import_batches
  WHERE id = v_row.batch_id;

  IF NOT public.can_manage_inbound_import(v_batch.runner_id) THEN
    RAISE EXCEPTION 'Not authorized to update this import';
  END IF;

  IF v_batch.status <> 'STAGED' THEN
    RAISE EXCEPTION 'Only staged imports can be edited';
  END IF;

  IF p_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.v_runner_target_users target
    WHERE target.runner_id = v_batch.runner_id
      AND target.user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Selected user is outside this runner inbound scope';
  END IF;

  IF p_product_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.products product
    WHERE product.id = p_product_id
      AND product.owner_user_id = p_user_id
      AND product.is_active
  ) THEN
    RAISE EXCEPTION 'Selected product does not belong to the selected user';
  END IF;

  UPDATE public.inbound_import_rows
  SET
    matched_user_id = p_user_id,
    user_confirmed = p_user_id IS NOT NULL,
    user_match_state = CASE WHEN p_user_id IS NULL THEN 'No Match' ELSE 'Exact' END,
    matched_product_id = p_product_id,
    product_confirmed = p_product_id IS NOT NULL,
    product_match_state = CASE WHEN p_product_id IS NULL THEN 'No Match' ELSE 'Exact' END,
    excluded = coalesce(p_excluded, excluded)
  WHERE id = p_row_id;

  PERFORM public.refresh_inbound_import_batch(v_batch.id);

  RETURN jsonb_build_object('success', true, 'batch_id', v_batch.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_inbound_import(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch public.inbound_import_batches%ROWTYPE;
  v_group record;
  v_row record;
  v_shipment_id uuid;
  v_item_id uuid;
  v_group_index integer := 0;
  v_shipments_created integer := 0;
  v_items_created integer := 0;
  v_total_qty integer := 0;
  v_tracking text;
  v_shipment_ids jsonb := '[]'::jsonb;
  v_result jsonb;
BEGIN
  SELECT * INTO v_batch
  FROM public.inbound_import_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF v_batch.id IS NULL THEN
    RAISE EXCEPTION 'Import batch not found';
  END IF;

  IF NOT public.can_manage_inbound_import(v_batch.runner_id) THEN
    RAISE EXCEPTION 'Not authorized to confirm this import';
  END IF;

  IF v_batch.status = 'CONFIRMED' THEN
    RETURN coalesce(
      v_batch.confirmation_result,
      jsonb_build_object('success', true, 'already_processed', true, 'batch_id', v_batch.id)
    ) || jsonb_build_object('already_processed', true);
  END IF;

  IF v_batch.status <> 'STAGED' THEN
    RAISE EXCEPTION 'Only staged imports can be confirmed';
  END IF;

  PERFORM public.refresh_inbound_import_batch(v_batch.id);

  SELECT * INTO v_batch
  FROM public.inbound_import_batches
  WHERE id = p_batch_id;

  IF v_batch.valid_count = 0 THEN
    RAISE EXCEPTION 'No valid rows are available to import';
  END IF;

  IF v_batch.invalid_count > 0 THEN
    RAISE EXCEPTION 'Resolve or exclude every invalid, duplicate, and unconfirmed row before import';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.inbound_import_rows row_data
    WHERE row_data.batch_id = v_batch.id
      AND row_data.validation_state = 'VALID'
      AND (
        NOT EXISTS (
          SELECT 1
          FROM public.v_runner_target_users target
          WHERE target.runner_id = v_batch.runner_id
            AND target.user_id = row_data.matched_user_id
        )
        OR NOT EXISTS (
          SELECT 1
          FROM public.products product
          WHERE product.id = row_data.matched_product_id
            AND product.owner_user_id = row_data.matched_user_id
            AND product.is_active
        )
      )
  ) THEN
    RAISE EXCEPTION 'Import scope changed. Review user and product matches again';
  END IF;

  FOR v_group IN
    SELECT
      matched_user_id,
      inbound_date,
      reference_number,
      string_agg(DISTINCT nullif(trim(remark), ''), ' | ')
        FILTER (WHERE nullif(trim(remark), '') IS NOT NULL) AS remark
    FROM public.inbound_import_rows
    WHERE batch_id = v_batch.id
      AND validation_state = 'VALID'
      AND NOT excluded
    GROUP BY matched_user_id, inbound_date, reference_number
    ORDER BY inbound_date, matched_user_id, reference_number
  LOOP
    v_group_index := v_group_index + 1;
    v_tracking := coalesce(
      nullif(trim(v_group.reference_number), ''),
      'BULK-' || upper(substr(v_batch.id::text, 1, 8)) || '-' || v_group_index::text
    );

    INSERT INTO public.inbound_shipments (
      runner_id,
      salesperson_id,
      tracking_no,
      arrival_date,
      status,
      notes
    )
    VALUES (
      v_batch.runner_id,
      v_group.matched_user_id,
      v_tracking,
      v_group.inbound_date,
      'PENDING_SP_ACK',
      nullif(v_group.remark, '')
    )
    RETURNING id INTO v_shipment_id;

    v_shipments_created := v_shipments_created + 1;
    v_shipment_ids := v_shipment_ids || jsonb_build_array(v_shipment_id);

    FOR v_row IN
      SELECT row_data.*, product.sku_code, product.sku_name
      FROM public.inbound_import_rows row_data
      JOIN public.products product ON product.id = row_data.matched_product_id
      WHERE row_data.batch_id = v_batch.id
        AND row_data.validation_state = 'VALID'
        AND NOT row_data.excluded
        AND row_data.matched_user_id = v_group.matched_user_id
        AND row_data.inbound_date = v_group.inbound_date
        AND row_data.reference_number = v_group.reference_number
      ORDER BY row_data.row_number
    LOOP
      INSERT INTO public.inbound_items (
        inbound_id,
        product_id,
        temp_sku_label,
        qty_reported,
        photo_url
      )
      VALUES (
        v_shipment_id,
        v_row.matched_product_id,
        trim(coalesce(v_row.sku_code, '') || ' ' || v_row.sku_name),
        v_row.quantity,
        ''
      )
      RETURNING id INTO v_item_id;

      UPDATE public.inbound_import_rows
      SET created_inbound_id = v_shipment_id,
          created_item_id = v_item_id
      WHERE id = v_row.id;

      v_items_created := v_items_created + 1;
      v_total_qty := v_total_qty + v_row.quantity;
    END LOOP;

    INSERT INTO public.notifications (
      user_id,
      title,
      message,
      type,
      entity_type,
      reference_type,
      reference_id,
      priority
    )
    VALUES (
      v_group.matched_user_id,
      'Inbound Pending Acknowledgment',
      'Inbound pending your acknowledgment: Tracking ' || v_tracking,
      'INBOUND_PENDING',
      'INBOUND',
      'INBOUND',
      v_shipment_id,
      'MEDIUM'
    );

    INSERT INTO public.audit_logs (
      entity_type,
      entity_id,
      action,
      actor_id,
      after_json
    )
    VALUES (
      'inbound_shipment',
      v_shipment_id,
      'INBOUND_CREATED_FROM_EXCEL',
      auth.uid(),
      jsonb_build_object(
        'batch_id', v_batch.id,
        'tracking_no', v_tracking,
        'salesperson_id', v_group.matched_user_id
      )
    );
  END LOOP;

  v_result := jsonb_build_object(
    'success', true,
    'already_processed', false,
    'batch_id', v_batch.id,
    'shipments_created', v_shipments_created,
    'items_created', v_items_created,
    'total_qty', v_total_qty,
    'shipment_ids', v_shipment_ids
  );

  UPDATE public.inbound_import_batches
  SET status = 'CONFIRMED',
      confirmed_at = now(),
      confirmation_result = v_result
  WHERE id = v_batch.id;

  INSERT INTO public.audit_logs (
    entity_type,
    entity_id,
    action,
    actor_id,
    after_json
  )
  VALUES (
    'inbound_import_batch',
    v_batch.id,
    'INBOUND_IMPORT_CONFIRMED',
    auth.uid(),
    v_result
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_inbound_import(uuid, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_inbound_import_row(uuid, uuid, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_inbound_import(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.prepare_inbound_import(uuid, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_inbound_import_row(uuid, uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_inbound_import(uuid) TO authenticated;
