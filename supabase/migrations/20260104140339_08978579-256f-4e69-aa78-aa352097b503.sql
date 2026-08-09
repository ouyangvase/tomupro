-- Add cancelled_by and cancelled_at columns to orders table
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS cancelled_at timestamp with time zone;

-- Seed default cancel reasons (idempotent - won't duplicate if they exist)
INSERT INTO public.reasons (reason_type, label, sort_order, is_active, created_by)
SELECT 'CANCEL', label, sort_order, true, (SELECT id FROM public.profiles WHERE role = 'admin' LIMIT 1)
FROM (VALUES
  ('Customer changed mind', 1),
  ('Customer unreachable', 2),
  ('Wrong / incomplete address', 3),
  ('Out of stock', 4),
  ('Payment issue', 5),
  ('Duplicate order', 6),
  ('Pricing mistake', 7),
  ('Internal admin decision', 8)
) AS v(label, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.reasons r 
  WHERE r.reason_type = 'CANCEL' AND r.label = v.label
);
