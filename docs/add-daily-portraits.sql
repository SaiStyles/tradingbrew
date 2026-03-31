-- Migration: daily_portraits table
-- Caches Hindsight reflect() output once per user per trading day.
-- Prevents reflect() from firing on every new browser tab / device.
-- Run once in Supabase SQL editor.

create table if not exists daily_portraits (
  user_id      uuid        not null references users(id) on delete cascade,
  trading_date date        not null,
  portrait     text        not null,
  created_at   timestamptz not null default now(),
  primary key (user_id, trading_date)
);

-- RLS: users can only read/write their own portrait
alter table daily_portraits enable row level security;

create policy "Users can read own portrait"
  on daily_portraits for select
  using (auth.uid() = user_id);

create policy "Users can upsert own portrait"
  on daily_portraits for insert
  with check (auth.uid() = user_id);

create policy "Users can update own portrait"
  on daily_portraits for update
  using (auth.uid() = user_id);

-- Optional: auto-purge portraits older than 30 days (keeps table lean)
-- Can run as a pg_cron job or manual cleanup
-- delete from daily_portraits where trading_date < current_date - interval '30 days';
