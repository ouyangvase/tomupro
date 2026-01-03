-- Create reschedule_history table to track all reschedule events
CREATE TABLE public.reschedule_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  cycle_no integer NOT NULL DEFAULT 1,
  rescheduled_at timestamptz NOT NULL DEFAULT now(),
  rescheduled_by uuid REFERENCES public.profiles(id),
  from_status text,
  to_status text,
  next_delivery_date date,
  reason_id uuid REFERENCES public.reasons(id),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.reschedule_history ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Reschedule history follows order access"
ON public.reschedule_history
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = reschedule_history.order_id
    AND (
      auth.uid() = o.salesperson_id OR
      auth.uid() = o.runner_id OR
      auth.uid() = o.driver_id OR
      get_user_role(auth.uid()) IN ('admin', 'manager')
    )
  )
);

CREATE POLICY "System can insert reschedule history"
ON public.reschedule_history
FOR INSERT
WITH CHECK (true);

-- Create index for faster lookups
CREATE INDEX idx_reschedule_history_order_id ON public.reschedule_history(order_id);

-- Enable realtime for the table
ALTER PUBLICATION supabase_realtime ADD TABLE public.reschedule_history;