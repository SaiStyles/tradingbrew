-- Telegram integration: add columns to users table
-- Run this in Supabase SQL Editor

ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_connect_token TEXT DEFAULT NULL;

-- Optional: index for fast token lookup during bot /start flow
CREATE INDEX IF NOT EXISTS users_telegram_connect_token_idx
  ON users (telegram_connect_token)
  WHERE telegram_connect_token IS NOT NULL;

-- ─── Required env vars (add to Vercel dashboard + .env.local) ────────────────
-- TELEGRAM_BOT_TOKEN       = bot token from @BotFather
-- TELEGRAM_BOT_NAME        = bot username without @ (e.g. tradingbrew_bot)
-- TELEGRAM_WEBHOOK_SECRET  = any random string (32+ chars) — set on both Vercel
--                            and when registering the webhook below

-- ─── One-time webhook registration (run once after deploying) ────────────────
-- Replace YOUR_DOMAIN, BOT_TOKEN and SECRET below, then open in browser:
--
-- https://api.telegram.org/bot{BOT_TOKEN}/setWebhook
--   ?url=https://YOUR_DOMAIN/api/telegram
--   &secret_token={TELEGRAM_WEBHOOK_SECRET}
--
-- Verify registration:
-- https://api.telegram.org/bot{BOT_TOKEN}/getWebhookInfo
