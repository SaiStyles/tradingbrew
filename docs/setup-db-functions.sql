-- ============================================================
-- TradingBrew — required Supabase SQL functions
-- Run this in Supabase SQL Editor before using the app
-- ============================================================

-- 1. increment_violation_count
-- Called by the buddy pipeline when Analyst detects rule violations.
-- Atomically increments violation_count on the current session.
CREATE OR REPLACE FUNCTION increment_violation_count(
  target_session_id UUID,
  increment_by INT
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE sessions
  SET violation_count = COALESCE(violation_count, 0) + increment_by
  WHERE id = target_session_id;
$$;


-- 2. run_analytics_query
-- Called by QueryAnalyst for conversational analytics (text-to-SQL).
-- Validates SELECT-only, injects user_id, enforces LIMIT 100.
-- Source: docs/setup-analytics-function.sql (run separately if not already done)
