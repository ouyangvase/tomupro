-- PART 3: ONE-TIME DATA CORRECTION
-- Convert legacy movement types to new standardized types

-- Log the correction
INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, before_json, after_json)
VALUES (
  'SYSTEM',
  gen_random_uuid(),
  'INVENTORY_CORRECTION_START',
  NULL,
  jsonb_build_object('timestamp', now()),
  jsonb_build_object('note', 'Starting one-time inventory logic correction')
);

-- Convert DRIVER_ALLOCATE_PREDEDUCT to DRIVER_PICKUP (and fix sign)
UPDATE public.stock_movements
SET movement_type = 'DRIVER_PICKUP',
    qty_change = ABS(qty_change)
WHERE movement_type = 'DRIVER_ALLOCATE_PREDEDUCT';

-- Convert SALE_DEDUCT to DELIVERY_ACCEPTED
UPDATE public.stock_movements
SET movement_type = 'DELIVERY_ACCEPTED'
WHERE movement_type = 'SALE_DEDUCT';

-- Convert DRIVER_RETURN to RUNNER_RETURN_ACK
UPDATE public.stock_movements
SET movement_type = 'RUNNER_RETURN_ACK'
WHERE movement_type = 'DRIVER_RETURN';

-- Log completion
INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, before_json, after_json)
VALUES (
  'SYSTEM',
  gen_random_uuid(),
  'INVENTORY_CORRECTION_COMPLETE',
  NULL,
  jsonb_build_object('timestamp', now()),
  jsonb_build_object(
    'note', 'One-time inventory logic correction completed',
    'changes', ARRAY[
      'Converted DRIVER_ALLOCATE_PREDEDUCT to DRIVER_PICKUP',
      'Converted SALE_DEDUCT to DELIVERY_ACCEPTED', 
      'Converted DRIVER_RETURN to RUNNER_RETURN_ACK',
      'Created stock_states_view for state separation',
      'Added validation trigger for stock mutations'
    ]
  )
);