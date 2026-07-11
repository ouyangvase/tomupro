-- =============================================
-- Runner Assistant Role + Receipt Flow Improvements
-- =============================================

-- 1) Add runner_assistant to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'runner_assistant';

-- 2) Create runner_assistants table
CREATE TABLE IF NOT EXISTS public.runner_assistants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  runner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assistant_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  can_deliver boolean NOT NULL DEFAULT false,
  can_confirm_receipt boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_runner_assistant UNIQUE (assistant_id)
);

-- 3) Enable RLS
ALTER TABLE public.runner_assistants ENABLE ROW LEVEL SECURITY;

-- 4) RLS policies for runner_assistants
DO $$ BEGIN
  CREATE POLICY "Admin can manage runner_assistants"
    ON public.runner_assistants FOR ALL
    USING (public.get_user_role(auth.uid()) = 'admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Runner can view their assistants"
    ON public.runner_assistants FOR SELECT
    USING (runner_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Assistant can view own binding"
    ON public.runner_assistants FOR SELECT
    USING (assistant_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 5) Orders RLS for runner assistants (SELECT)
DO $$ BEGIN
  CREATE POLICY "Runner assistant can view assigned runner orders"
    ON public.orders FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.runner_assistants ra
        WHERE ra.assistant_id = auth.uid()
          AND ra.runner_id = orders.runner_id
          AND ra.is_active = true
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 6) Orders RLS for runner assistants (UPDATE) — needed for receipt confirm/reject
DO $$ BEGIN
  CREATE POLICY "Runner assistant can update assigned runner orders"
    ON public.orders FOR UPDATE
    USING (
      EXISTS (
        SELECT 1 FROM public.runner_assistants ra
        WHERE ra.assistant_id = auth.uid()
          AND ra.runner_id = orders.runner_id
          AND ra.is_active = true
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 7) Helper RPC: get runner_id for a given assistant
CREATE OR REPLACE FUNCTION public.get_assistant_runner(p_assistant_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT runner_id FROM runner_assistants
  WHERE assistant_id = p_assistant_id AND is_active = true
  LIMIT 1;
$$;

-- 8) Update mark_order_delivered_fast to accept runner assistants with can_deliver
CREATE OR REPLACE FUNCTION mark_order_delivered_fast(p_order_id UUID, p_actor_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
BEGIN
  SELECT id, runner_id, runner_status, stock_deducted, payment_method, receipt_status
  INTO v_order
  FROM orders
  WHERE id = p_order_id;

  IF v_order IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  -- Authorization: must be the runner OR an active assistant with can_deliver
  IF v_order.runner_id != p_actor_id THEN
    IF NOT EXISTS (
      SELECT 1 FROM runner_assistants
      WHERE assistant_id = p_actor_id
        AND runner_id = v_order.runner_id
        AND can_deliver = true
        AND is_active = true
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
    END IF;
  END IF;

  -- Block delivery for TRANSFER orders without confirmed receipt
  IF v_order.payment_method = 'TRANSFER' AND COALESCE(v_order.receipt_status, '') != 'confirmed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Receipt must be confirmed before delivery for transfer orders');
  END IF;

  -- Return success immediately if already delivered (idempotent)
  IF v_order.runner_status = 'DELIVERED' THEN
    RETURN jsonb_build_object('success', true, 'already_delivered', true);
  END IF;

  -- Now acquire lock and update
  SELECT id, runner_id, runner_status, stock_deducted
  INTO v_order
  FROM orders
  WHERE id = p_order_id
  FOR UPDATE SKIP LOCKED;

  IF v_order IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order locked by another process');
  END IF;

  IF v_order.runner_status = 'DELIVERED' THEN
    RETURN jsonb_build_object('success', true, 'already_delivered', true);
  END IF;

  UPDATE orders
  SET
    runner_status = 'DELIVERED',
    delivered_at = NOW(),
    updated_at = NOW()
  WHERE id = p_order_id;

  INSERT INTO public.delivery_queue (order_id, queued_at, status)
  VALUES (p_order_id, NOW(), 'PENDING')
  ON CONFLICT (order_id) DO NOTHING;

  RETURN jsonb_build_object(
    'success', true,
    'delivered_at', NOW(),
    'queued_for_processing', true
  );
END;
$$;
