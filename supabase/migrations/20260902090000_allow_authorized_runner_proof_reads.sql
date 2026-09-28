BEGIN;

-- Delivery photos are stored in a private bucket.  Runner Assistants can
-- already see the related orders, but the old Storage policy only recognized
-- the primary Runner, so signing the same proof URL failed for assistants.
DROP POLICY IF EXISTS "Users can view related delivery photos" ON storage.objects;

CREATE POLICY "Users can view related delivery photos" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'delivery-photos' AND
    (
      public.get_user_role(auth.uid()) IN ('admin', 'manager') OR
      EXISTS (
        SELECT 1
        FROM public.attachments a
        JOIN public.orders o ON a.order_id = o.id
        WHERE a.url LIKE '%' || storage.objects.name || '%'
          AND (
            auth.uid() = o.salesperson_id OR
            auth.uid() = o.runner_id OR
            public.has_runner_assistant_permission(auth.uid(), o.runner_id, 'driver_inbox') OR
            public.has_runner_assistant_permission(auth.uid(), o.runner_id, 'driver_operations') OR
            public.has_runner_assistant_permission(auth.uid(), o.runner_id, 'deliver') OR
            public.has_runner_assistant_permission(auth.uid(), o.runner_id, 'confirm_receipt')
          )
      )
    )
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
