-- TradingBrew — Core Database Schema
-- Run this in your Supabase SQL editor to create all tables.
-- After this, run the optional add-*.sql files for Telegram, screenshots, etc.
-- ─────────────────────────────────────────────────────────────────────────────

-- Users (extends Supabase auth.users)
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  name text,
  buddy_name text default 'Brew',
  buddy_personality text default 'default',
  buddy_voice_id text,
  experience text,
  timezone text default 'UTC',
  trading_timezone text not null default 'America/New_York',
  subscription text default 'free',
  onboarding_complete boolean default false,
  notif_morning boolean default true,
  notif_news boolean default true,
  notif_violations boolean default true,
  notif_debrief boolean default true,
  telegram_chat_id text,
  telegram_connect_token text,
  created_at timestamptz default now(),
  last_active timestamptz
);

-- Auto-create user row on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Accounts
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  account_type text check (account_type in ('prop_firm', 'personal', 'live', 'demo')),
  firm_name text,
  nickname text,
  broker text,
  account_size numeric,
  current_balance numeric,
  trailing_drawdown numeric,
  daily_loss_limit numeric,
  max_trades_day integer,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Sessions
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  started_at timestamptz default now(),
  ended_at timestamptz,
  total_trades integer default 0,
  pnl numeric default 0,
  violations integer default 0,
  violation_count integer default 0,
  mood_start text,
  mood_end text,
  debrief_given boolean default false,
  conversation_state jsonb default '{}'
);

-- Trades
create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  session_id uuid references public.sessions(id),
  instrument text not null,
  direction text check (direction in ('long', 'short')),
  entry_price numeric,
  exit_price numeric,
  stop_loss numeric,
  pnl numeric,
  rr text,
  position_size numeric,
  session text check (session in ('london', 'new_york', 'asia', 'overlap')),
  opened_at timestamptz,
  closed_at timestamptz,
  emotion_tag text check (emotion_tag in (
    'confident', 'anxious', 'frustrated', 'calm', 'excited',
    'fearful', 'greedy', 'disciplined', 'impulsive', 'neutral'
  )),
  execution_score integer check (execution_score between 1 and 10),
  followed_plan boolean,
  setup_type text,
  exit_reason text,
  mistakes text[] default '{}',
  market_condition text,
  notes text,
  voice_note_url text,
  incomplete boolean default false,
  deleted_at timestamptz,
  created_at timestamptz default now()
);

-- Rules
create table if not exists public.rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  raw_text text,
  is_active boolean default true,
  last_triggered_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz default now()
);

-- Rule violations
create table if not exists public.rule_violations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  rule_id uuid references public.rules(id),
  trade_id uuid references public.trades(id),
  session_id uuid references public.sessions(id),
  description text,
  analyst_reasoning text,
  violated_at timestamptz default now()
);

-- Psychology log (Scribe writes here)
create table if not exists public.psychology_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  trade_id uuid references public.trades(id),
  entry_date date not null,
  observation text not null,
  created_at timestamptz default now()
);

-- Daily AI notes (cached per day)
create table if not exists public.daily_ai_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  entry_date date not null,
  note text not null,
  generated_at timestamptz,
  unique (user_id, entry_date)
);

-- Daily trader portraits (Hindsight reflect() cache)
create table if not exists public.daily_portraits (
  user_id uuid not null references public.users(id) on delete cascade,
  trading_date date not null,
  portrait text not null,
  created_at timestamptz default now(),
  primary key (user_id, trading_date)
);

-- Goals
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  goal_text text not null,
  goal_type text check (goal_type in ('performance', 'psychology', 'process', 'risk')),
  is_completed boolean default false,
  week_start date not null,
  created_at timestamptz default now()
);

-- News events (economic calendar)
create table if not exists public.news_events (
  id uuid primary key default gen_random_uuid(),
  title text,
  impact text check (impact in ('high', 'medium', 'low')),
  currency text,
  scheduled_at timestamptz,
  actual text,
  forecast text,
  previous text,
  created_at timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.users enable row level security;
alter table public.accounts enable row level security;
alter table public.sessions enable row level security;
alter table public.trades enable row level security;
alter table public.rules enable row level security;
alter table public.rule_violations enable row level security;
alter table public.psychology_log enable row level security;
alter table public.daily_ai_notes enable row level security;
alter table public.daily_portraits enable row level security;
alter table public.goals enable row level security;
alter table public.news_events enable row level security;

-- Users can only see and edit their own data
create policy "users: own row" on public.users for all using (auth.uid() = id);
create policy "accounts: own rows" on public.accounts for all using (auth.uid() = user_id);
create policy "sessions: own rows" on public.sessions for all using (auth.uid() = user_id);
create policy "trades: own rows" on public.trades for all using (auth.uid() = user_id);
create policy "rules: own rows" on public.rules for all using (auth.uid() = user_id);
create policy "rule_violations: own rows" on public.rule_violations for all using (auth.uid() = user_id);
create policy "psychology_log: own rows" on public.psychology_log for all using (auth.uid() = user_id);
create policy "daily_ai_notes: own rows" on public.daily_ai_notes for all using (auth.uid() = user_id);
create policy "daily_portraits: own rows" on public.daily_portraits for all using (auth.uid() = user_id);
create policy "goals: own rows" on public.goals for all using (auth.uid() = user_id);
create policy "news_events: public read" on public.news_events for select using (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- Storage Buckets
-- Create these manually in Supabase Dashboard → Storage:
--
-- 1. trade-screenshots  (public)  — trade chart screenshots, max 5MB/file
-- 2. trade-voice-notes  (public)  — voice notes per trade, max 25MB/file
-- ─────────────────────────────────────────────────────────────────────────────
