-- Data repair: Restore missing stock for orders that were reverted but didn't get RETURN_TO_OWNER movements

INSERT INTO stock_movements (warehouse_id, product_id, movement_type, qty_change, reference_type, order_id, created_by)
SELECT 
  o.fulfillment_warehouse_id,
  oi.product_id,
  'RETURN_TO_OWNER',
  oi.qty,
  'ORDER_ITEM',
  o.id,
  al.actor_id
FROM orders o
JOIN order_items oi ON oi.order_id = o.id AND oi.product_id IS NOT NULL
JOIN audit_logs al ON al.entity_id = o.id AND al.action = 'DELIVERY_REVERTED'
LEFT JOIN stock_movements sm ON sm.order_id = o.id 
  AND sm.product_id = oi.product_id 
  AND sm.movement_type = 'RETURN_TO_OWNER'
WHERE o.stock_deducted = false
  AND o.fulfillment_warehouse_id IS NOT NULL
  AND sm.id IS NULL
  AND EXISTS (
    SELECT 1 FROM stock_movements deduct 
    WHERE deduct.order_id = o.id 
    AND deduct.product_id = oi.product_id 
    AND deduct.movement_type = 'DELIVER_DEDUCT'
  );