-- Phase 3: Driver Returns + Ranking + Enhanced Driver Features

-- Create driver_returns table
CREATE TABLE public.driver_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES public.profiles(id),
  runner_id uuid NOT NULL REFERENCES public.profiles(id),
  related_pickup_id uuid REFERENCES public.driver_pickups(id),
  status text NOT NULL DEFAULT 'PENDING_RUNNER_ACK' CHECK (status IN ('PENDING_RUNNER_ACK', 'RUNNER_ACKED', 'CANCELLED')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES public.profiles(id)
);

-- Create driver_return_items table
CREATE TABLE public.driver_return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES public.driver_returns(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  qty integer NOT NULL CHECK (qty > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on driver_returns
ALTER TABLE public.driver_returns ENABLE ROW LEVEL SECURITY;

-- RLS for driver_returns
CREATE POLICY "Admin can manage all returns"
  ON public.driver_returns FOR ALL
  USING (get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Runner can manage their returns"
  ON public.driver_returns FOR ALL
  USING (runner_id = auth.uid());

CREATE POLICY "Driver can view and create their returns"
  ON public.driver_returns FOR SELECT
  USING (driver_id = auth.uid());

CREATE POLICY "Driver can insert their returns"
  ON public.driver_returns FOR INSERT
  WITH CHECK (driver_id = auth.uid());

-- Enable RLS on driver_return_items
ALTER TABLE public.driver_return_items ENABLE ROW LEVEL SECURITY;

-- RLS for driver_return_items
CREATE POLICY "Access return items through return"
  ON public.driver_return_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.driver_returns dr 
      WHERE dr.id = driver_return_items.return_id
      AND (dr.runner_id = auth.uid() OR dr.driver_id = auth.uid() OR get_user_role(auth.uid()) = 'admin')
    )
  );

-- Create feature_settings table for visibility toggles
CREATE TABLE public.feature_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type text NOT NULL CHECK (scope_type IN ('RUNNER', 'GLOBAL')),
  scope_id uuid, -- null for GLOBAL, runner_id for RUNNER scope
  setting_key text NOT NULL,
  value_boolean boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope_type, scope_id, setting_key)
);

-- Enable RLS on feature_settings
ALTER TABLE public.feature_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage all feature settings"
  ON public.feature_settings FOR ALL
  USING (get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Runner can manage their feature settings"
  ON public.feature_settings FOR ALL
  USING (scope_type = 'RUNNER' AND scope_id = auth.uid());

CREATE POLICY "Anyone can read global settings"
  ON public.feature_settings FOR SELECT
  USING (scope_type = 'GLOBAL');

CREATE POLICY "Driver can read their runner's settings"
  ON public.feature_settings FOR SELECT
  USING (
    scope_type = 'RUNNER' AND 
    EXISTS (
      SELECT 1 FROM public.runner_drivers rd 
      WHERE rd.runner_id = feature_settings.scope_id 
      AND rd.driver_id = auth.uid() 
      AND rd.is_active = true
    )
  );

-- Function to process driver return and create stock movements
CREATE OR REPLACE FUNCTION public.process_driver_return_acknowledgment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  item RECORD;
  warehouse_id uuid;
BEGIN
  -- Only trigger when status changes to RUNNER_ACKED
  IF NEW.status = 'RUNNER_ACKED' AND OLD.status = 'PENDING_RUNNER_ACK' THEN
    -- Get runner's warehouse
    SELECT id INTO warehouse_id
    FROM public.warehouses
    WHERE owner_user_id = NEW.runner_id
    AND warehouse_type = 'RUNNER'
    LIMIT 1;
    
    IF warehouse_id IS NOT NULL THEN
      -- Create return movements for each item
      FOR item IN
        SELECT ri.product_id, ri.qty
        FROM public.driver_return_items ri
        WHERE ri.return_id = NEW.id
      LOOP
        INSERT INTO public.stock_movements (
          warehouse_id, product_id, movement_type, qty_change,
          reference_type, reference_id, created_by
        ) VALUES (
          warehouse_id,
          item.product_id,
          'DRIVER_RETURN',
          item.qty, -- positive qty to add back
          'MANUAL',
          NEW.id,
          auth.uid()
        );
      END LOOP;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for return acknowledgment
CREATE TRIGGER trigger_process_driver_return
  AFTER UPDATE ON public.driver_returns
  FOR EACH ROW
  EXECUTE FUNCTION public.process_driver_return_acknowledgment();

-- Notification for return submitted
CREATE OR REPLACE FUNCTION public.notify_return_submitted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  driver_name TEXT;
  item_count INTEGER;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT display_name INTO driver_name
    FROM public.profiles WHERE id = NEW.driver_id;
    
    SELECT COUNT(*) INTO item_count
    FROM public.driver_return_items WHERE return_id = NEW.id;
    
    INSERT INTO public.notifications (
      user_id, title, message, type, priority,
      reference_type, reference_id, entity_type, recipient_role
    ) VALUES (
      NEW.runner_id,
      'Return Submitted',
      'Driver ' || COALESCE(driver_name, 'Unknown') || ' submitted a return request' ||
      E'\nPlease acknowledge receipt of returned items',
      'RETURN_SUBMITTED',
      'HIGH',
      'driver_return',
      NEW.id,
      'DRIVER_RETURN',
      'runner'
    );
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_notify_return_submitted
  AFTER INSERT ON public.driver_returns
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_return_submitted();

-- Notification for return acknowledged
CREATE OR REPLACE FUNCTION public.notify_return_acknowledged()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  runner_name TEXT;
BEGIN
  IF NEW.status = 'RUNNER_ACKED' AND OLD.status = 'PENDING_RUNNER_ACK' THEN
    SELECT display_name INTO runner_name
    FROM public.profiles WHERE id = NEW.runner_id;
    
    INSERT INTO public.notifications (
      user_id, title, message, type, priority,
      reference_type, reference_id, entity_type, recipient_role
    ) VALUES (
      NEW.driver_id,
      'Return Acknowledged',
      'Your return has been acknowledged by ' || COALESCE(runner_name, 'Runner') ||
      E'\nYou can now receive new pickups',
      'RETURN_ACKNOWLEDGED',
      'MEDIUM',
      'driver_return',
      NEW.id,
      'DRIVER_RETURN',
      'driver'
    );
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_notify_return_acknowledged
  AFTER UPDATE ON public.driver_returns
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_return_acknowledged();

-- Create view for monthly driver ranking
CREATE OR REPLACE VIEW public.driver_monthly_ranking AS
SELECT 
  o.driver_id,
  p.display_name as driver_name,
  rd.runner_id,
  rp.display_name as runner_name,
  DATE_TRUNC('month', o.delivered_at) as month,
  COUNT(*) FILTER (WHERE o.runner_accept_status = 'ACCEPTED') as delivered_count,
  SUM(o.total_amount) FILTER (WHERE o.runner_accept_status = 'ACCEPTED') as total_amount,
  COUNT(*) FILTER (WHERE o.driver_status = 'DRIVER_FAILED') as failed_count,
  RANK() OVER (
    PARTITION BY rd.runner_id, DATE_TRUNC('month', o.delivered_at)
    ORDER BY COUNT(*) FILTER (WHERE o.runner_accept_status = 'ACCEPTED') DESC
  ) as rank_in_team
FROM public.orders o
JOIN public.runner_drivers rd ON rd.driver_id = o.driver_id AND rd.is_active = true
JOIN public.profiles p ON p.id = o.driver_id
JOIN public.profiles rp ON rp.id = rd.runner_id
WHERE o.driver_id IS NOT NULL
  AND o.delivered_at IS NOT NULL
GROUP BY o.driver_id, p.display_name, rd.runner_id, rp.display_name, DATE_TRUNC('month', o.delivered_at);

-- Function to check if driver ranking is visible
CREATE OR REPLACE FUNCTION public.is_ranking_visible_for_driver(p_driver_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (
      SELECT fs.value_boolean
      FROM public.feature_settings fs
      JOIN public.runner_drivers rd ON rd.runner_id = fs.scope_id
      WHERE rd.driver_id = p_driver_id
        AND rd.is_active = true
        AND fs.setting_key = 'driver_ranking_visible'
        AND fs.scope_type = 'RUNNER'
      LIMIT 1
    ),
    (
      SELECT fs.value_boolean
      FROM public.feature_settings fs
      WHERE fs.setting_key = 'driver_ranking_visible'
        AND fs.scope_type = 'GLOBAL'
      LIMIT 1
    ),
    false
  )
$$;