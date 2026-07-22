-- Admin-editable WhatsApp order message template used by runner/driver order phone links.
CREATE TABLE IF NOT EXISTS public.message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  body text NOT NULL,
  variables text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Message templates viewable by authenticated users" ON public.message_templates;
CREATE POLICY "Message templates viewable by authenticated users"
ON public.message_templates
FOR SELECT
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admins can insert message templates" ON public.message_templates;
CREATE POLICY "Admins can insert message templates"
ON public.message_templates
FOR INSERT
WITH CHECK (get_user_role(auth.uid()) = 'admin'::app_role);

DROP POLICY IF EXISTS "Admins can update message templates" ON public.message_templates;
CREATE POLICY "Admins can update message templates"
ON public.message_templates
FOR UPDATE
USING (get_user_role(auth.uid()) = 'admin'::app_role)
WITH CHECK (get_user_role(auth.uid()) = 'admin'::app_role);

DROP POLICY IF EXISTS "Admins can delete message templates" ON public.message_templates;
CREATE POLICY "Admins can delete message templates"
ON public.message_templates
FOR DELETE
USING (get_user_role(auth.uid()) = 'admin'::app_role);

DROP TRIGGER IF EXISTS update_message_templates_updated_at ON public.message_templates;
CREATE TRIGGER update_message_templates_updated_at
BEFORE UPDATE ON public.message_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.message_templates (
  template_key,
  name,
  description,
  body,
  variables
) VALUES (
  'customer_whatsapp_order_message',
  'Customer WhatsApp Message',
  'Message used when runner or driver users open WhatsApp from an order phone number.',
  'Hi @name, this is Logistic Admin from Tomu.

Delivery Info
Name: @name
Contact: @phone
Address: @address
Area: @area

Product:
@items

Total Qty: @qty
Price: @price

Delivery will be arranged according to runner route.
Runner will contact you before delivery.

Please choose payment:

COD

Bank Transfer (please inform us for drop-off)

BIBD: 00-008-01-0051019
Baiduri: 0300117734291
Tomu Enterprise',
  ARRAY['@name', '@phone', '@address', '@area', '@ordercode', '@productname', '@qty', '@price', '@items']
) ON CONFLICT (template_key) DO NOTHING;

-- Reason rows should be truly deletable from the admin UI.
-- Preserve orders/history by nulling references instead of blocking delete or deleting orders.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'runner_failed_reason_id'
  ) THEN
    ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_runner_failed_reason_id_fkey;
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_runner_failed_reason_id_fkey
      FOREIGN KEY (runner_failed_reason_id)
      REFERENCES public.reasons(id)
      ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'reschedule_history'
      AND column_name = 'reason_id'
  ) THEN
    ALTER TABLE public.reschedule_history DROP CONSTRAINT IF EXISTS reschedule_history_reason_id_fkey;
    ALTER TABLE public.reschedule_history
      ADD CONSTRAINT reschedule_history_reason_id_fkey
      FOREIGN KEY (reason_id)
      REFERENCES public.reasons(id)
      ON DELETE SET NULL;
  END IF;
END $$;
