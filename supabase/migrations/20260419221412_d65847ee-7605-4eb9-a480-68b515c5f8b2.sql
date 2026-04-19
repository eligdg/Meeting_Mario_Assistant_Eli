-- Restrict profiles SELECT to the owning user only
DROP POLICY IF EXISTS "Profiles viewable by authenticated users" ON public.profiles;

CREATE POLICY "Users can view own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Add UPDATE policy on recordings storage bucket scoped to owner (folder = user id)
CREATE POLICY "Users can update own recordings"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'recordings' AND auth.uid()::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'recordings' AND auth.uid()::text = (storage.foldername(name))[1]);
