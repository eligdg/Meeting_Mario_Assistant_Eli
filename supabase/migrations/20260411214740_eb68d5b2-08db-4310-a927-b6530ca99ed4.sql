
-- Meetings table
CREATE TABLE public.meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT 'Sin título',
  recording_type TEXT NOT NULL DEFAULT 'mic',
  duration_seconds INTEGER,
  file_path TEXT,
  file_size BIGINT,
  mime_type TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  transcript TEXT,
  ai_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own meetings" ON public.meetings FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_meetings_updated_at BEFORE UPDATE ON public.meetings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket for recordings
INSERT INTO storage.buckets (id, name, public) VALUES ('recordings', 'recordings', false);

-- Storage policies
CREATE POLICY "Users can upload own recordings" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'recordings' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view own recordings" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'recordings' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own recordings" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'recordings' AND auth.uid()::text = (storage.foldername(name))[1]);
