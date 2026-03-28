-- Fix acknowledged_at backfill: use stock_movement timestamps instead of created_at
-- The original backfill incorrectly set acknowledged_at = created_at (shipment creation time).
-- This corrects it to use the stock_movement created_at which is the real acknowledge action time.

UPDATE inbound_shipments s
SET acknowledged_at = sub.real_ack_time
FROM (
  SELECT ii.inbound_id, MIN(sm.created_at) as real_ack_time
  FROM stock_movements sm
  JOIN inbound_items ii ON ii.id::text = sm.reference_id::text
  WHERE sm.reference_type = 'INBOUND_ITEM'
  GROUP BY ii.inbound_id
) sub
WHERE s.id = sub.inbound_id
  AND s.status = 'ACKNOWLEDGED'
  AND s.acknowledged_at = s.created_at;
