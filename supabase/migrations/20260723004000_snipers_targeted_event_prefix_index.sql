-- Speed up targeted one-time TOMUPRO -> SNIPERS recovery batches.
-- This supports filtering existing delivered events by status and Sales Entry order-code prefix
-- without re-enabling the global backlog drain.

CREATE INDEX IF NOT EXISTS idx_snipers_delivery_events_status_code_created
  ON public.snipers_delivery_events (delivery_status, sales_entry_order_code, created_at)
  WHERE event_type = 'tomupro.order.delivered';
