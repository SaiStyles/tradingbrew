-- Run once in Supabase SQL Editor
-- Psychology data layer: per-trade observations + daily AI notes

-- ─────────────────────────────────────────
-- psychology_log: Scribe observations per day
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS psychology_log (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  trade_id    UUID REFERENCES trades(id) ON DELETE SET NULL,
  entry_date  DATE NOT NULL,
  observation TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE psychology_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "psychology_log: users own their data"
  ON psychology_log FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_psychology_log_user_date
  ON psychology_log(user_id, entry_date);

-- ─────────────────────────────────────────
-- daily_ai_notes: generated warm narrative per day
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_ai_notes (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  entry_date    DATE NOT NULL,
  note          TEXT NOT NULL,
  generated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, entry_date)
);

ALTER TABLE daily_ai_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "daily_ai_notes: users own their data"
  ON daily_ai_notes FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_daily_ai_notes_user_date
  ON daily_ai_notes(user_id, entry_date);
