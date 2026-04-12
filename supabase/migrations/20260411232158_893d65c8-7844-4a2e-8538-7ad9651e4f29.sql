
-- Google Drive tokens per user
CREATE TABLE public.google_drive_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.google_drive_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own drive tokens"
  ON public.google_drive_tokens FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_google_drive_tokens_updated_at
  BEFORE UPDATE ON public.google_drive_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Drive sync settings per user
CREATE TABLE public.drive_sync_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  auto_export_recordings boolean NOT NULL DEFAULT false,
  auto_export_summaries boolean NOT NULL DEFAULT false,
  drive_folder_id text,
  drive_folder_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.drive_sync_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own drive settings"
  ON public.drive_sync_settings FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_drive_sync_settings_updated_at
  BEFORE UPDATE ON public.drive_sync_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
