-- Create app role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'salesperson', 'runner');

-- Create warehouse type enum
CREATE TYPE public.warehouse_type AS ENUM ('SALESPERSON', 'RUNNER');

-- Create payment method enum
CREATE TYPE public.payment_method AS ENUM ('COD', 'TRANSFER');

-- Create order status enum
CREATE TYPE public.order_status AS ENUM ('BOOKING', 'READY', 'CANCELLED');

-- Create runner status enum
CREATE TYPE public.runner_status AS ENUM ('UNASSIGNED', 'ASSIGNED', 'TAKEN', 'DELIVERED', 'FAILED_DELIVERY');

-- Create failed next step enum
CREATE TYPE public.failed_next_step AS ENUM ('RESCHEDULE', 'SALESPERSON_CONTACT');

-- Create reconciliation status enum
CREATE TYPE public.reconciliation_status AS ENUM ('NOT_CLAIMED', 'CLAIMED', 'SP_ACK_PENDING', 'ADMIN_ACK_PENDING', 'SETTLED', 'DISPUTE');

-- Create claim method enum
CREATE TYPE public.claim_method AS ENUM ('TRANSFER', 'CASH', 'OTHER');

-- Create inbound status enum
CREATE TYPE public.inbound_status AS ENUM ('PENDING_SP_ACK', 'ACKNOWLEDGED', 'DISPUTE');

-- Create movement type enum
CREATE TYPE public.movement_type AS ENUM ('INBOUND', 'SALE_DEDUCT', 'ADJUSTMENT', 'RETURN');

-- Create reference type enum
CREATE TYPE public.reference_type AS ENUM ('INBOUND_ITEM', 'ORDER_ITEM', 'MANUAL');

-- Create attachment type enum
CREATE TYPE public.attachment_type AS ENUM ('transfer_proof', 'receipt_photo', 'chat_screenshot', 'delivery_photo', 'inbound_photo', 'other');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'salesperson',
  display_name TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create user_roles table for additional role security
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create warehouses table
CREATE TABLE public.warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_type public.warehouse_type NOT NULL,
  owner_user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on warehouses
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;

-- Create products table
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_code TEXT,
  sku_name TEXT NOT NULL,
  created_by UUID REFERENCES public.profiles(id) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- Enable RLS on products
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Create orders table
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  area TEXT,
  channel TEXT,
  notes TEXT,
  payment_method public.payment_method NOT NULL DEFAULT 'COD',
  salesperson_id UUID REFERENCES public.profiles(id) NOT NULL,
  runner_id UUID REFERENCES public.profiles(id),
  status public.order_status NOT NULL DEFAULT 'BOOKING',
  expected_pickup_date DATE,
  total_qty INTEGER NOT NULL DEFAULT 0,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  runner_status public.runner_status NOT NULL DEFAULT 'UNASSIGNED',
  failed_reason TEXT,
  failed_next_step public.failed_next_step,
  next_delivery_date DATE,
  reconciliation_status public.reconciliation_status NOT NULL DEFAULT 'NOT_CLAIMED',
  dispute_reason TEXT,
  dispute_notes TEXT,
  fulfillment_warehouse_id UUID REFERENCES public.warehouses(id),
  stock_deducted BOOLEAN NOT NULL DEFAULT false,
  cancel_reason TEXT,
  cancel_notes TEXT,
  delivered_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on orders
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Create order_items table
CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES public.products(id),
  sku_label TEXT,
  qty INTEGER NOT NULL DEFAULT 1,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on order_items
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- Create expected_date_history table
CREATE TABLE public.expected_date_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  old_date DATE,
  new_date DATE,
  changed_by UUID REFERENCES public.profiles(id) NOT NULL,
  changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on expected_date_history
ALTER TABLE public.expected_date_history ENABLE ROW LEVEL SECURITY;

-- Create bindings table (Salesperson ↔ Runner)
CREATE TABLE public.bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salesperson_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  runner_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.profiles(id) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (salesperson_id, runner_id)
);

-- Enable RLS on bindings
ALTER TABLE public.bindings ENABLE ROW LEVEL SECURITY;

-- Create claims table
CREATE TABLE public.claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  method public.claim_method,
  note TEXT,
  proof_url TEXT,
  created_by UUID REFERENCES public.profiles(id) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on claims
ALTER TABLE public.claims ENABLE ROW LEVEL SECURITY;

-- Create attachments table
CREATE TABLE public.attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  claim_id UUID REFERENCES public.claims(id) ON DELETE CASCADE,
  inbound_item_id UUID,
  url TEXT NOT NULL,
  type public.attachment_type NOT NULL DEFAULT 'other',
  uploaded_by UUID REFERENCES public.profiles(id) NOT NULL,
  uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on attachments
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;

-- Create inbound_shipments table
CREATE TABLE public.inbound_shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  runner_id UUID REFERENCES public.profiles(id) NOT NULL,
  salesperson_id UUID REFERENCES public.profiles(id) NOT NULL,
  tracking_no TEXT NOT NULL,
  arrival_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status public.inbound_status NOT NULL DEFAULT 'PENDING_SP_ACK',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on inbound_shipments
ALTER TABLE public.inbound_shipments ENABLE ROW LEVEL SECURITY;

-- Create inbound_items table
CREATE TABLE public.inbound_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inbound_id UUID REFERENCES public.inbound_shipments(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES public.products(id),
  temp_sku_label TEXT,
  qty_reported INTEGER NOT NULL,
  qty_acknowledged INTEGER,
  photo_url TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on inbound_items
ALTER TABLE public.inbound_items ENABLE ROW LEVEL SECURITY;

-- Create stock_movements table
CREATE TABLE public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id UUID REFERENCES public.warehouses(id) NOT NULL,
  product_id UUID REFERENCES public.products(id) NOT NULL,
  movement_type public.movement_type NOT NULL,
  qty_change INTEGER NOT NULL,
  reference_type public.reference_type NOT NULL,
  reference_id UUID,
  created_by UUID REFERENCES public.profiles(id) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on stock_movements
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

-- Create audit_logs table
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,
  before_json JSONB,
  after_json JSONB,
  actor_id UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Create cancel_reasons table
CREATE TABLE public.cancel_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reason TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on cancel_reasons
ALTER TABLE public.cancel_reasons ENABLE ROW LEVEL SECURITY;

-- Create failed_reasons table
CREATE TABLE public.failed_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reason TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on failed_reasons
ALTER TABLE public.failed_reasons ENABLE ROW LEVEL SECURITY;

-- Create notifications table
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  reference_type TEXT,
  reference_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Create stock_balance_view
CREATE OR REPLACE VIEW public.stock_balance_view AS
SELECT 
  sm.warehouse_id,
  w.name AS warehouse_name,
  w.owner_user_id,
  p_owner.display_name AS owner_name,
  sm.product_id,
  pr.sku_code,
  pr.sku_name,
  SUM(sm.qty_change) AS balance_qty,
  MAX(sm.created_at) AS last_movement_time
FROM public.stock_movements sm
JOIN public.warehouses w ON sm.warehouse_id = w.id
JOIN public.profiles p_owner ON w.owner_user_id = p_owner.id
JOIN public.products pr ON sm.product_id = pr.id
GROUP BY sm.warehouse_id, w.name, w.owner_user_id, p_owner.display_name, sm.product_id, pr.sku_code, pr.sku_name;

-- Create function to check user role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create function to get user role from profiles
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = _user_id
$$;

-- Create function to update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for orders updated_at
CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  user_role public.app_role;
  new_warehouse_id UUID;
BEGIN
  -- Get role from metadata or default to salesperson
  user_role := COALESCE(
    (NEW.raw_user_meta_data ->> 'role')::public.app_role,
    'salesperson'
  );
  
  -- Insert into profiles
  INSERT INTO public.profiles (id, role, display_name, email)
  VALUES (
    NEW.id,
    user_role,
    COALESCE(NEW.raw_user_meta_data ->> 'display_name', split_part(NEW.email, '@', 1)),
    NEW.email
  );
  
  -- Insert into user_roles
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, user_role);
  
  -- Auto-create warehouse for salesperson or runner
  IF user_role IN ('salesperson', 'runner') THEN
    INSERT INTO public.warehouses (warehouse_type, owner_user_id, name)
    VALUES (
      CASE WHEN user_role = 'salesperson' THEN 'SALESPERSON'::public.warehouse_type ELSE 'RUNNER'::public.warehouse_type END,
      NEW.id,
      COALESCE(NEW.raw_user_meta_data ->> 'display_name', split_part(NEW.email, '@', 1)) || '''s Warehouse'
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create function to log expected_date changes
CREATE OR REPLACE FUNCTION public.log_expected_date_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF OLD.expected_pickup_date IS DISTINCT FROM NEW.expected_pickup_date THEN
    INSERT INTO public.expected_date_history (order_id, old_date, new_date, changed_by)
    VALUES (NEW.id, OLD.expected_pickup_date, NEW.expected_pickup_date, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger for expected_date changes
CREATE TRIGGER log_expected_date_change
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.log_expected_date_change();

-- RLS Policies

-- Profiles: Everyone can read all profiles
CREATE POLICY "Profiles are viewable by everyone" ON public.profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- User roles: Only admins can manage, everyone can read their own
CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id OR public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Admins can manage roles" ON public.user_roles
  FOR ALL USING (public.get_user_role(auth.uid()) = 'admin');

-- Warehouses: Everyone can view, owners can update
CREATE POLICY "Warehouses viewable by all authenticated" ON public.warehouses
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Warehouse owners can update" ON public.warehouses
  FOR UPDATE USING (auth.uid() = owner_user_id OR public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Admins can manage warehouses" ON public.warehouses
  FOR ALL USING (public.get_user_role(auth.uid()) = 'admin');

-- Products: Everyone can view, salesperson/admin can create/edit
CREATE POLICY "Products viewable by all authenticated" ON public.products
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Salesperson and admin can create products" ON public.products
  FOR INSERT WITH CHECK (
    public.get_user_role(auth.uid()) IN ('salesperson', 'admin')
  );

CREATE POLICY "Salesperson and admin can update products" ON public.products
  FOR UPDATE USING (
    public.get_user_role(auth.uid()) IN ('salesperson', 'admin')
  );

-- Orders: Role-based access
CREATE POLICY "Salesperson can view own orders" ON public.orders
  FOR SELECT USING (
    auth.uid() = salesperson_id OR 
    auth.uid() = runner_id OR 
    public.get_user_role(auth.uid()) IN ('admin', 'manager')
  );

CREATE POLICY "Salesperson can create orders" ON public.orders
  FOR INSERT WITH CHECK (
    auth.uid() = salesperson_id OR 
    public.get_user_role(auth.uid()) = 'admin'
  );

CREATE POLICY "Salesperson and runner can update their orders" ON public.orders
  FOR UPDATE USING (
    auth.uid() = salesperson_id OR 
    auth.uid() = runner_id OR 
    public.get_user_role(auth.uid()) = 'admin'
  );

CREATE POLICY "Only admin can delete orders" ON public.orders
  FOR DELETE USING (public.get_user_role(auth.uid()) = 'admin');

-- Order items: Same as orders
CREATE POLICY "Order items follow order access" ON public.order_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.orders o 
      WHERE o.id = order_id 
      AND (
        auth.uid() = o.salesperson_id OR 
        auth.uid() = o.runner_id OR 
        public.get_user_role(auth.uid()) IN ('admin', 'manager')
      )
    )
  );

-- Expected date history: Same as orders
CREATE POLICY "Expected date history follows order access" ON public.expected_date_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.orders o 
      WHERE o.id = order_id 
      AND (
        auth.uid() = o.salesperson_id OR 
        auth.uid() = o.runner_id OR 
        public.get_user_role(auth.uid()) IN ('admin', 'manager')
      )
    )
  );

CREATE POLICY "Users can insert expected date history for their orders" ON public.expected_date_history
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o 
      WHERE o.id = order_id 
      AND (auth.uid() = o.salesperson_id OR public.get_user_role(auth.uid()) = 'admin')
    )
  );

-- Bindings: Admin manages, salesperson/runner can view their own
CREATE POLICY "Users can view their bindings" ON public.bindings
  FOR SELECT USING (
    auth.uid() = salesperson_id OR 
    auth.uid() = runner_id OR 
    public.get_user_role(auth.uid()) IN ('admin', 'manager')
  );

CREATE POLICY "Admins can manage bindings" ON public.bindings
  FOR ALL USING (public.get_user_role(auth.uid()) = 'admin');

-- Claims: Runner creates, related parties can view
CREATE POLICY "Claims viewable by related parties" ON public.claims
  FOR SELECT USING (
    auth.uid() = created_by OR
    EXISTS (
      SELECT 1 FROM public.orders o 
      WHERE o.id = order_id 
      AND (auth.uid() = o.salesperson_id OR auth.uid() = o.runner_id)
    ) OR
    public.get_user_role(auth.uid()) IN ('admin', 'manager')
  );

CREATE POLICY "Runners can create claims" ON public.claims
  FOR INSERT WITH CHECK (
    auth.uid() = created_by AND 
    public.get_user_role(auth.uid()) IN ('runner', 'admin')
  );

-- Attachments: Same as related entity
CREATE POLICY "Attachments viewable by authenticated" ON public.attachments
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can upload attachments" ON public.attachments
  FOR INSERT WITH CHECK (auth.uid() = uploaded_by);

-- Inbound shipments: Runner creates, salesperson acknowledges
CREATE POLICY "Inbound shipments viewable by related parties" ON public.inbound_shipments
  FOR SELECT USING (
    auth.uid() = runner_id OR 
    auth.uid() = salesperson_id OR 
    public.get_user_role(auth.uid()) IN ('admin', 'manager')
  );

CREATE POLICY "Runners can create inbound shipments" ON public.inbound_shipments
  FOR INSERT WITH CHECK (
    auth.uid() = runner_id OR 
    public.get_user_role(auth.uid()) = 'admin'
  );

CREATE POLICY "Salesperson can update inbound shipments" ON public.inbound_shipments
  FOR UPDATE USING (
    auth.uid() = salesperson_id OR 
    public.get_user_role(auth.uid()) = 'admin'
  );

-- Inbound items: Same as inbound shipments
CREATE POLICY "Inbound items follow shipment access" ON public.inbound_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.inbound_shipments s 
      WHERE s.id = inbound_id 
      AND (
        auth.uid() = s.runner_id OR 
        auth.uid() = s.salesperson_id OR 
        public.get_user_role(auth.uid()) IN ('admin', 'manager')
      )
    )
  );

-- Stock movements: Everyone can view, restricted create
CREATE POLICY "Stock movements viewable by all authenticated" ON public.stock_movements
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Create stock movements for authorized users" ON public.stock_movements
  FOR INSERT WITH CHECK (
    auth.uid() = created_by AND
    public.get_user_role(auth.uid()) IN ('salesperson', 'admin')
  );

-- Audit logs: Admin and manager can view all
CREATE POLICY "Audit logs viewable by admin and manager" ON public.audit_logs
  FOR SELECT USING (public.get_user_role(auth.uid()) IN ('admin', 'manager'));

CREATE POLICY "System can insert audit logs" ON public.audit_logs
  FOR INSERT WITH CHECK (true);

-- Cancel reasons: Everyone can view, admin can manage
CREATE POLICY "Cancel reasons viewable by all authenticated" ON public.cancel_reasons
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage cancel reasons" ON public.cancel_reasons
  FOR ALL USING (public.get_user_role(auth.uid()) = 'admin');

-- Failed reasons: Everyone can view, admin can manage
CREATE POLICY "Failed reasons viewable by all authenticated" ON public.failed_reasons
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage failed reasons" ON public.failed_reasons
  FOR ALL USING (public.get_user_role(auth.uid()) = 'admin');

-- Notifications: Users can only see their own
CREATE POLICY "Users can view own notifications" ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "System can create notifications" ON public.notifications
  FOR INSERT WITH CHECK (true);

-- Create storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('proofs', 'proofs', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('inbound-photos', 'inbound-photos', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('delivery-photos', 'delivery-photos', true);

-- Storage policies
CREATE POLICY "Authenticated users can upload proofs" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'proofs' AND auth.uid() IS NOT NULL);

CREATE POLICY "Anyone can view proofs" ON storage.objects
  FOR SELECT USING (bucket_id = 'proofs');

CREATE POLICY "Authenticated users can upload inbound photos" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'inbound-photos' AND auth.uid() IS NOT NULL);

CREATE POLICY "Anyone can view inbound photos" ON storage.objects
  FOR SELECT USING (bucket_id = 'inbound-photos');

CREATE POLICY "Authenticated users can upload delivery photos" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'delivery-photos' AND auth.uid() IS NOT NULL);

CREATE POLICY "Anyone can view delivery photos" ON storage.objects
  FOR SELECT USING (bucket_id = 'delivery-photos');

-- Insert default cancel reasons
INSERT INTO public.cancel_reasons (reason) VALUES 
  ('Customer cancelled'),
  ('Out of stock'),
  ('Wrong order'),
  ('Price issue'),
  ('Duplicate order'),
  ('Other');

-- Insert default failed reasons
INSERT INTO public.failed_reasons (reason) VALUES 
  ('Customer not available'),
  ('Wrong address'),
  ('Customer refused'),
  ('Payment issue'),
  ('Product damaged'),
  ('Other');