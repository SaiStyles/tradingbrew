-- Migration: proactive_queue + proactive_log tables
-- Required for Phase 2 Proactive Buddy (cron-based triggers + Supabase Realtime delivery).
-- Phase 1 (session opener) works without these — proactive_log failure is handled gracefully.
-- Run once in Supabase SQL editor.

-- ─────────────────────────────────────────────────────────────────
-- proactive_queue: messages waiting to be delivered to the browser
-- Supabase Realtime watches this table — BuddyChat receives new rows
-- ─────────────────────────────────────────────────────────────────
create table if not exists proactive_queue (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references users(id) on delete cascade,
  message      text        not null,
  mode         text        not null,  -- greet | celebrate | check_in | intervene | debrief | reconnect | milestone | quiet
  trigger_type text        not null,  -- session_start | loss_streak | eod_debrief | returning_user | drawdown_threshold
  delivered    boolean     not null default false,
  created_at   timestamptz not null default now()
);

alter table proactive_queue enable row level security;

create policy "Users can read own queue"
  on proactive_queue for select
  using (auth.uid() = user_id);

create policy "Users can update own queue"
  on proactive_queue for update
  using (auth.uid() = user_id);

-- Service role inserts (from cron) — no RLS policy needed for insert
-- The cron endpoint uses service role key implicitly via Supabase server client

-- Realtime: enable for proactive_queue so BuddyChat receives pushes
alter publication supabase_realtime add table proactive_queue;

-- ─────────────────────────────────────────────────────────────────
-- proactive_log: records every proactive message sent
-- Used for: rate limiting (30 min between messages), EOD debrief dedup, analytics
-- ─────────────────────────────────────────────────────────────────
create table if not exists proactive_log (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references users(id) on delete cascade,
  trigger_type text        not null,
  mode         text        not null,
  created_at   timestamptz not null default now()
);

alter table proactive_log enable row level security;

-- Users can read their own log (optional — for future "your Buddy history" feature)
create policy "Users can read own proactive log"
  on proactive_log for select
  using (auth.uid() = user_id);

-- Indexes for rate-limit queries
create index if not exists idx_proactive_log_user_created
  on proactive_log (user_id, created_at desc);

create index if not exists idx_proactive_log_user_mode_date
  on proactive_log (user_id, mode, created_at desc);

-- Auto-purge queue entries older than 24 hours (keeps table lean)
-- Can run as a pg_cron job or manual cleanup:
-- delete from proactive_queue where created_at < now() - interval '24 hours';
