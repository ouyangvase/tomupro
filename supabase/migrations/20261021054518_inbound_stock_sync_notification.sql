-- Keep the recipient's stock screens in sync after an inbound is acknowledged.
-- The acknowledgement RPC already posts the INBOUND stock movement atomically.
-- This trigger adds a recipient notification for the cross-device refresh path.

CREATE OR REPLACE FUNCTION public.notify_inbound_stock_received()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'ACKNOWLEDGED'
     AND OLD.status IS DISTINCT FROM NEW.status
     AND NEW.salesperson_id IS NOT NULL
     AND NEW.salesperson_id <> NEW.runner_id
  THEN
    INSERT INTO public.notifications (
      user_id,
      title,
      message,
      type,
      priority,
      reference_type,
      reference_id,
      entity_type
    )
    VALUES (
      NEW.salesperson_id,
      'Inbound stock received',
      'Inbound shipment ' || NEW.tracking_no || ' has been added to your stock.',
      'INBOUND_ACKED',
      'LOW',
      'INBOUND',
      NEW.id,
      'INBOUND'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_inbound_stock_received ON public.inbound_shipments;

CREATE TRIGGER notify_inbound_stock_received
AFTER UPDATE OF status ON public.inbound_shipments
FOR EACH ROW
WHEN (NEW.status = 'ACKNOWLEDGED' AND OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.notify_inbound_stock_received();
