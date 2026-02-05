-- Create driver_order_remarks table for private remarks
CREATE TABLE public.driver_order_remarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  driver_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  remark_type TEXT NOT NULL,
  remark_text TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(order_id, driver_user_id)
);

-- Create driver_order_priority table for manual sorting
CREATE TABLE public.driver_order_priority (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  priority_number INT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(driver_user_id, order_id)
);

-- Enable RLS on both tables
ALTER TABLE public.driver_order_remarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_order_priority ENABLE ROW LEVEL SECURITY;

-- RLS for driver_order_remarks: Drivers can only manage their own remarks
CREATE POLICY "Drivers can manage own remarks"
  ON public.driver_order_remarks FOR ALL
  USING (driver_user_id = auth.uid())
  WITH CHECK (driver_user_id = auth.uid());

-- RLS for driver_order_priority: Drivers can only manage their own priorities
CREATE POLICY "Drivers can manage own priorities"
  ON public.driver_order_priority FOR ALL
  USING (driver_user_id = auth.uid())
  WITH CHECK (driver_user_id = auth.uid());

-- Enable realtime for both tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_order_remarks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_order_priority;

-- Create updated_at trigger function if not exists
CREATE OR REPLACE FUNCTION public.update_driver_remarks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for updated_at
CREATE TRIGGER update_driver_order_remarks_updated_at
  BEFORE UPDATE ON public.driver_order_remarks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_driver_remarks_updated_at();

CREATE TRIGGER update_driver_order_priority_updated_at
  BEFORE UPDATE ON public.driver_order_priority
  FOR EACH ROW
  EXECUTE FUNCTION public.update_driver_remarks_updated_at();