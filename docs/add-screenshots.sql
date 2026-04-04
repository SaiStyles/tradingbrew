-- Trade screenshots table + Supabase Storage setup
-- Run this in Supabase SQL editor
-- Then create the storage bucket manually (instructions below)

-- ─── Table ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS screenshots (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trade_id    UUID        NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  storage_path TEXT       NOT NULL,
  url         TEXT        NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup by trade
CREATE INDEX IF NOT EXISTS screenshots_trade_id_idx ON screenshots(trade_id);
CREATE INDEX IF NOT EXISTS screenshots_user_id_idx  ON screenshots(user_id);

-- ─── Row-level security ────────────────────────────────────────────────────

ALTER TABLE screenshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own screenshots"
  ON screenshots FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── Storage bucket (do this in Supabase dashboard) ───────────────────────
-- 1. Go to Storage → New bucket
-- 2. Name: trade-screenshots
-- 3. Public bucket: YES (URLs are unguessable — UUID paths)
-- 4. File size limit: 5 MB
-- 5. Allowed MIME types: image/jpeg, image/png, image/webp, image/gif

-- Storage RLS policies (run after creating the bucket):

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'trade-screenshots',
  'trade-screenshots',
  true,
  5242880,  -- 5 MB
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users upload own screenshots"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'trade-screenshots' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Authenticated users delete own screenshots"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'trade-screenshots' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Anyone can view screenshots"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'trade-screenshots');
