-- Create enum for delivery charge status
CREATE TYPE public.delivery_charge_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- Create delivery_charges table with versioning
CREATE TABLE public.delivery_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  runner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  area TEXT NOT NULL,
  charge_amount NUMERIC NOT NULL CHECK (charge_amount >= 0),
  status delivery_charge_status NOT NULL DEFAULT 'PENDING',
  proposed_by UUID NOT NULL REFERENCES public.profiles(id),
  approved_by UUID REFERENCES public.profiles(id),
  approved_at TIMESTAMPTZ,
  rejection_remark TEXT,
  superseded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.delivery_charges ENABLE ROW LEVEL SECURITY;

-- Index for efficient lookups
CREATE INDEX idx_delivery_charges_runner_area ON public.delivery_charges(runner_id, area);
CREATE INDEX idx_delivery_charges_status ON public.delivery_charges(status);

-- Create unique partial index to ensure only ONE active APPROVED charge per (runner_id + area)
CREATE UNIQUE INDEX idx_delivery_charges_unique_approved 
ON public.delivery_charges(runner_id, area) 
WHERE status = 'APPROVED' AND superseded_at IS NULL;

-- RLS Policies

-- Runners can view their own delivery charges
CREATE POLICY "Runners can view own delivery charges"
ON public.delivery_charges
FOR SELECT
USING (
  runner_id = auth.uid() 
  OR get_user_role(auth.uid()) IN ('admin', 'manager')
);

-- Runners can propose new delivery charges
CREATE POLICY "Runners can propose delivery charges"
ON public.delivery_charges
FOR INSERT
WITH CHECK (
  proposed_by = auth.uid() 
  AND runner_id = auth.uid()
  AND status = 'PENDING'
);

-- Only admins can update (approve/reject) delivery charges
CREATE POLICY "Admin can update delivery charges"
ON public.delivery_charges
FOR UPDATE
USING (get_user_role(auth.uid()) = 'admin');

-- No deletion allowed (audit trail)
-- CREATE POLICY "No deletion allowed" intentionally omitted

-- Add delivery_fee and net_claim_amount to claims table
ALTER TABLE public.claims
ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS net_claim_amount NUMERIC,
ADD COLUMN IF NOT EXISTS gross_amount NUMERIC;

-- Update trigger for updated_at
CREATE TRIGGER update_delivery_charges_updated_at
BEFORE UPDATE ON public.delivery_charges
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Function to get active delivery charge for runner + area
CREATE OR REPLACE FUNCTION public.get_delivery_charge(p_runner_id UUID, p_area TEXT)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT charge_amount
  FROM public.delivery_charges
  WHERE runner_id = p_runner_id
    AND area = p_area
    AND status = 'APPROVED'
    AND superseded_at IS NULL
  ORDER BY approved_at DESC
  LIMIT 1
$$;

-- Notification trigger for delivery charge proposals
CREATE OR REPLACE FUNCTION public.notify_delivery_charge_proposed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  runner_name TEXT;
  admin_user RECORD;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'PENDING' THEN
    -- Get runner name
    SELECT display_name INTO runner_name
    FROM public.profiles WHERE id = NEW.runner_id;
    
    -- Notify all Admins
    FOR admin_user IN
      SELECT id FROM public.profiles WHERE role = 'admin'
    LOOP
      INSERT INTO public.notifications (
        user_id, title, message, type, priority,
        reference_type, reference_id, entity_type, recipient_role
      ) VALUES (
        admin_user.id,
        'Delivery Charge Proposal',
        'Runner ' || COALESCE(runner_name, 'Unknown') || ' proposed delivery charge' ||
        E'\nArea: ' || NEW.area ||
        E'\nAmount: RM' || NEW.charge_amount::text ||
        E'\nAwaiting approval',
        'DELIVERY_CHARGE_PROPOSED',
        'HIGH',
        'delivery_charge',
        NEW.id::text,
        'DELIVERY_CHARGE',
        'admin'
      );
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_notify_delivery_charge_proposed
AFTER INSERT ON public.delivery_charges
FOR EACH ROW
EXECUTE FUNCTION public.notify_delivery_charge_proposed();

-- Notification trigger for delivery charge approval/rejection
CREATE OR REPLACE FUNCTION public.notify_delivery_charge_decision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  admin_name TEXT;
BEGIN
  -- On approval
  IF NEW.status = 'APPROVED' AND OLD.status = 'PENDING' THEN
    SELECT display_name INTO admin_name
    FROM public.profiles WHERE id = NEW.approved_by;
    
    INSERT INTO public.notifications (
      user_id, title, message, type, priority,
      reference_type, reference_id, entity_type, recipient_role
    ) VALUES (
      NEW.runner_id,
      'Delivery Charge Approved',
      'Your delivery charge proposal has been approved' ||
      E'\nArea: ' || NEW.area ||
      E'\nAmount: RM' || NEW.charge_amount::text ||
      E'\nApproved by: ' || COALESCE(admin_name, 'Admin'),
      'DELIVERY_CHARGE_APPROVED',
      'MEDIUM',
      'delivery_charge',
      NEW.id::text,
      'DELIVERY_CHARGE',
      'runner'
    );
  END IF;
  
  -- On rejection
  IF NEW.status = 'REJECTED' AND OLD.status = 'PENDING' THEN
    SELECT display_name INTO admin_name
    FROM public.profiles WHERE id = NEW.approved_by;
    
    INSERT INTO public.notifications (
      user_id, title, message, type, priority,
      reference_type, reference_id, entity_type, recipient_role
    ) VALUES (
      NEW.runner_id,
      'Delivery Charge Rejected',
      'Your delivery charge proposal has been rejected' ||
      E'\nArea: ' || NEW.area ||
      E'\nAmount: RM' || NEW.charge_amount::text ||
      CASE WHEN NEW.rejection_remark IS NOT NULL 
        THEN E'\nReason: ' || NEW.rejection_remark 
        ELSE '' 
      END,
      'DELIVERY_CHARGE_REJECTED',
      'MEDIUM',
      'delivery_charge',
      NEW.id::text,
      'DELIVERY_CHARGE',
      'runner'
    );
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_notify_delivery_charge_decision
AFTER UPDATE ON public.delivery_charges
FOR EACH ROW
EXECUTE FUNCTION public.notify_delivery_charge_decision();