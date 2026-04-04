# TradingBrew — Live Database Schema
> Source of truth. Verified from Supabase export on 2026-04-04.
> Migration run 2026-04-04: added setup_type, exit_reason, mistakes. Dropped take_profit, duration_mins, streaks table, user_news_interactions table.

---

## public.trades
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| user_id | uuid | FK → public.users(id) |
| session_id | uuid | FK → public.sessions(id) |
| instrument | text | NOT NULL |
| direction | text | CHECK: 'long' \| 'short' |
| entry_price | numeric | |
| exit_price | numeric | |
| stop_loss | numeric | |
| pnl | numeric | |
| position_size | numeric | |
| session | text | CHECK: 'london' \| 'new_york' \| 'asia' \| 'overlap' |
| opened_at | timestamptz | |
| closed_at | timestamptz | |
| emotion_tag | text | CHECK: valid emotion enum |
| execution_score | integer | CHECK: 1–10 |
| followed_plan | boolean | |
| notes | text | |
| voice_note_url | text | |
| created_at | timestamptz | DEFAULT now() |
| incomplete | boolean | DEFAULT false |
| deleted_at | timestamptz | soft delete |
| rr | text | free text e.g. "1:2", "2.3R" |
| market_condition | text | |
| setup_type | text | what setup was traded — free text |
| exit_reason | text | Target hit / Breakeven / Stop out / Manual exit / Time stop / Trailing stop / News/event |
| mistakes | text[] | DEFAULT '{}' — multi-select mistake tags (plain strings) |

**Dropped (migration 2026-04-04):** take_profit, duration_mins (calculated in code), streaks table, user_news_interactions table

**Storage buckets:**
- `trade-screenshots` — public, max 6/trade, 5MB/file. Path: {user_id}/{trade_id}/{timestamp}.ext
- `trade-voice-notes` — public, 1/trade (voice_note_url on trades row), 25MB max. Path: {user_id}/{trade_id}/voice-{timestamp}.ext

---

## public.users
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, FK → auth.users(id) |
| email | text | UNIQUE NOT NULL |
| name | text | |
| buddy_name | text | DEFAULT 'Brew' |
| experience | text | |
| timezone | text | DEFAULT 'UTC' |
| subscription | text | DEFAULT 'free' |
| onboarding_complete | boolean | DEFAULT false |
| created_at | timestamptz | |
| last_active | timestamptz | |
| buddy_personality | text | DEFAULT 'default' |
| buddy_voice_id | text | |
| trading_timezone | text | NOT NULL, DEFAULT 'America/New_York' |
| notif_morning | boolean | DEFAULT true |
| notif_news | boolean | DEFAULT true |
| notif_violations | boolean | DEFAULT true |
| notif_debrief | boolean | DEFAULT true |
| telegram_chat_id | text | |
| telegram_connect_token | text | |

---

## public.accounts
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| user_id | uuid | FK → public.users(id) |
| account_type | text | CHECK: 'prop_firm' \| 'personal' \| 'live' \| 'demo' |
| firm_name | text | |
| account_size | numeric | |
| current_balance | numeric | |
| trailing_drawdown | numeric | |
| daily_loss_limit | numeric | |
| max_trades_day | integer | |
| is_active | boolean | DEFAULT true |
| created_at | timestamptz | |
| broker | text | |
| nickname | text | |

---

## public.screenshots
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| user_id | uuid | FK → auth.users(id) |
| trade_id | uuid | FK → public.trades(id) ON DELETE CASCADE |
| storage_path | text | NOT NULL — {user_id}/{trade_id}/{timestamp}.ext |
| url | text | NOT NULL — public Supabase Storage URL |
| created_at | timestamptz | DEFAULT now() |

Bucket: `trade-screenshots` (public). Max 6 per trade, 5MB per file.

---

## public.rules
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| user_id | uuid | FK → public.users(id) |
| is_active | boolean | DEFAULT true |
| created_at | timestamptz | |
| raw_text | text | |
| last_triggered_at | timestamptz | |
| deleted_at | timestamptz | hard delete flow: nullify rule_id on violations first, then delete row |

---

## public.rule_violations
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| user_id | uuid | FK → public.users(id) |
| rule_id | uuid | FK → public.rules(id) — NULLABLE (nullified before rule delete) |
| trade_id | uuid | FK → public.trades(id) — NULLABLE |
| description | text | |
| violated_at | timestamptz | DEFAULT now() — **NO created_at column** |
| analyst_reasoning | text | |
| session_id | uuid | FK → public.sessions(id) |

---

## public.sessions
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| user_id | uuid | FK → public.users(id) |
| started_at | timestamptz | DEFAULT now() |
| ended_at | timestamptz | |
| total_trades | integer | DEFAULT 0 |
| pnl | numeric | DEFAULT 0 |
| violations | integer | DEFAULT 0 |
| mood_start | text | |
| mood_end | text | |
| debrief_given | boolean | DEFAULT false |
| conversation_state | jsonb | DEFAULT '{}' — full session state stored here |
| violation_count | integer | DEFAULT 0 |

---

## public.psychology_log
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| user_id | uuid | FK → public.users(id) |
| trade_id | uuid | FK → public.trades(id) — NULLABLE |
| entry_date | date | NOT NULL — trader's timezone DATE |
| observation | text | NOT NULL — Scribe writes here |
| created_at | timestamptz | |

---

## public.daily_ai_notes
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| user_id | uuid | FK → public.users(id) |
| entry_date | date | NOT NULL |
| note | text | NOT NULL |
| generated_at | timestamptz | |

Unique on (user_id, entry_date) — upserted. Cached forever for past days.

---

## public.daily_portraits
| Column | Type | Notes |
|--------|------|-------|
| user_id | uuid | PK (composite) |
| trading_date | date | PK (composite) |
| portrait | text | NOT NULL — reflect() output |
| created_at | timestamptz | |

---

## public.proactive_queue
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| user_id | uuid | FK → public.users(id) |
| message | text | NOT NULL |
| mode | text | NOT NULL |
| trigger_type | text | NOT NULL |
| delivered | boolean | DEFAULT false |
| created_at | timestamptz | |

## public.proactive_log
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| user_id | uuid | FK → public.users(id) |
| trigger_type | text | NOT NULL |
| mode | text | NOT NULL |
| created_at | timestamptz | |

---

## Other tables (exist, light usage)
- **public.goals** — user weekly goals (goal_text, goal_type, is_completed, week_start)
- **public.streaks** — streak_type, current_count, best_count, last_updated
- **public.news_events** — title, impact (high/medium/low), currency, scheduled_at, actual/forecast/previous
- **public.user_news_interactions** — traded_during, pnl_during, news_event_id

---

## Pending migrations (not yet in DB)
These need SQL migration before any UI can use them:
- `trades.setup_type` text — what setup was traded (breakout, pullback, etc.)
- `trades.exit_reason` text — stop out / target hit / manual / time stop
- `trades.mistakes` text[] — array of tagged mistakes per trade
- `trades.risk_amount` numeric — dollar amount risked
- `trades.r_multiple` numeric — achieved R
