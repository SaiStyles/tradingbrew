-- TradingBrew — Trades schema cleanup + new fields
-- Run in Supabase SQL editor

-- ─── Drop unused columns from trades ──────────────────────────────
ALTER TABLE public.trades DROP COLUMN IF EXISTS duration_mins;
ALTER TABLE public.trades DROP COLUMN IF EXISTS take_profit;

-- ─── Add new fields to trades ─────────────────────────────────────
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS setup_type  text;
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS exit_reason text;
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS mistakes    text[] DEFAULT '{}';

-- ─── Drop unused tables ───────────────────────────────────────────
DROP TABLE IF EXISTS public.streaks CASCADE;
DROP TABLE IF EXISTS public.user_news_interactions CASCADE;
