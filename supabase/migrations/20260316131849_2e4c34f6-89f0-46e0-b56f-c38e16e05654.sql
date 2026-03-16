
-- Storage RLS for event-images bucket
CREATE POLICY "Anyone can view event images"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'event-images');

CREATE POLICY "Admins can upload event images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'event-images' AND
  public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can delete event images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'event-images' AND
  public.has_role(auth.uid(), 'admin')
);
