-- Allow managers/viewers to view profiles of users they have active data shares with
CREATE POLICY "viewer_can_see_shared_subject_profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 
      FROM user_data_shares uds
      WHERE uds.viewer_user_id = auth.uid()
        AND uds.subject_user_id = profiles.id
        AND uds.active = true
    )
  );