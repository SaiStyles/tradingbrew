# TradingBrew 🎙️
> Jarvis for traders. Always live, always watching, speaks before you ask.

## What This Is
TradingBrew is a live AI trading companion — not a journal app, not a signal provider.
Think Tony Stark and Jarvis — the buddy no trader has ever had.

## What It Is NOT
- Not signals, not charting, not financial advice
- Not competing with TradingView, Tradovate, Rithmic, MT4/MT5
- Not a mobile app (lowest priority, maybe never)
- Not a surveillance tool — never creepy, always warm

## Product Architecture
- Web app (Next.js) = full dashboard, journal, settings, performance
- Tauri desktop app (later) = lightweight voice companion, always on top
- Same backend, same codebase — Tauri wraps web frontend
- PWA as stepping stone before Tauri

## Tech Stack
- Frontend: Next.js 15, TypeScript, TailwindCSS, Framer Motion, Recharts 3.8.1
- Backend: Next.js API routes, Node.js
- Database: Supabase (PostgreSQL)
- Auth: Supabase Auth
- Storage: Supabase Storage
- AI Agents: 7-agent pipeline
  → Extractor (Haiku) — field extraction + query_type detection
  → Context (Pure TS, no AI) — data fetching from Supabase + Hindsight recall
  → QueryAnalyst (Haiku) — text-to-SQL for historical questions, gated on query_type
  → Analyst (Haiku) — pattern detection, background
  → Buddy (Haiku default, Sonnet only when intervention_needed=true) — natural conversation, plain text
  → SaveDetector (Haiku) — save decision
  → Scribe (Haiku) — psychological memory builder, fires post-response via after()
- Agent Parser: shared lib/claude/parser.ts
- Memory: Hindsight (gen2 agentic memory) — semantic recall, Mental Models, reflect()
- Database Facts: Supabase PostgreSQL (trades, rules, accounts)
- Voice V1: Web Speech API (free) + Web Speech Synthesis (free)
- Voice V2: Whisper (input) + ElevenLabs (output) — after launch
- Deployment: Vercel
- Desktop: Tauri (5MB, lighter than Electron) — V2

## Buddy Personality System — KEY V1 FEATURE
- User can choose ANY personality — viral hook
- Default options: Friendly Mentor, Drill Sergeant, Zen Master, Gordon Gekko
- Custom: user types anything — "Jack Sparrow", "Gordon Gekko", "Batman" — Claude adapts fully
- Stored in users.buddy_personality
- V1: personality in text only — already works today
- V2: matching ElevenLabs voice — character voices from ElevenLabs community library
- NEVER real celebrity voice cloning — legal risk. "Jack Sparrow voice" = stylistic approximation, not Johnny Depp
- Buddy name customizable → users.buddy_name
- Viral hook: combo of character voice + character text = screenshot moments ("greed is good, but that stop loss wasn't")
- Low cost (Haiku) = low barrier = big user base = acquisition proof for firm sales

## Voice Design
- Toggle ON/OFF — never always-on without consent
- Green pulsing indicator when listening
- Continuous listening when ON
- Web Speech reads every response aloud automatically

## Pricing
- V1 Launch: FREE — build users first
- V2: Free (30 trades) | Pro $19/month (unlimited + all features)

## Acquisition Target
- Buyers: Tradovate, Apex, TopStep, TradingView
- Minimum price: $10M
- Trigger: 2000+ DAU with retention data
- Strategy: approach 3-5 buyers simultaneously

## Project Structure
```
tradingbrew/
├── web/
│   ├── app/
│   │   ├── (auth)/login/ + register/
│   │   ├── (dashboard)/dashboard/  ← route fix applied
│   │   ├── onboarding/
│   │   └── api/buddy/ trades/ rules/ news/ auth/ test/
│   ├── components/buddy/ journal/ ui/ layout/
│   ├── lib/supabase/ claude/ memory/ voice/
│   ├── hooks/
│   └── types/
└── docs/sections/
```

## Database — 15 Tables
- users (buddy_name, buddy_personality, buddy_voice_id, trading_timezone)
- accounts (NOT prop_firm_accounts — supports prop/personal/live/demo + nickname)
- trades (includes account_id)
- screenshots, rules, rule_violations, emotions
- goals, streaks, milestones, memories, progress
- news_events, user_news_interactions, sessions
- DROPPED: prop_firm_accounts, content_feed
- NOTE: psychological profile columns (tilt_trigger, primary_edge, buddy_approach etc.)
  are dead — Hindsight Mental Models own this now, do not write or read them

## Memory Architecture — CURRENT (Session 8)
- **Supabase** → FACTS (trades, rules, accounts) — unchanged
- **Hindsight** → PSYCHOLOGICAL MEMORY (gen2, replaces memories table)
  → `lib/memory/hindsight.ts` — singleton client
  → `retain()` — Scribe writes plain text observations, async processing
  → `recall()` — Context fetches relevant memories per message (semantic, budget: mid)
  → `reflect()` — called once per trading day, returns living trader portrait for Buddy
  → Mental Models — 4 auto-refreshing psychological questions per user bank:
      tilt_trigger, primary_edge, buddy_approach, blind_spots
  → Directives — 3 hard rules enforced on every reflect():
      no direct memory reference, no financial advice, empathy first
- **Bank ID**: `tradingbrew-{userId}` — per user, auto-created on first message
- **Env vars**: HINDSIGHT_BASE_URL + HINDSIGHT_API_KEY (cloud or self-hosted)
- **Trader Portrait**: reflect() result cached in session state, refreshed each trading day
  → Buddy receives as "WHO THIS TRADER IS" section in system prompt
  → Empty for new users, activates as Scribe builds observations
- Supabase memories table still exists in schema but is no longer written to

## Agent Architecture — 7 Agent Pipeline

Every buddy message runs through this pipeline:

EXTRACTOR (Haiku)
- Input: raw user message + trading timezone
- Output: structured JSON fields only
- Also detects: query_type ("historical_analysis" | null)
  and query_subtype ("data" | "psychology" | "both" | null)
- No history, no personality, pure extraction
- Runs on every message

CONTEXT (Pure TypeScript — no AI call)
- Input: user_id + trading timezone + current message
- Output: context packet containing:
  → Relevant memories via Hindsight recall() (semantic, query = current message)
  → Today's trades summary + P&L
  → Active rules
  → Account info
  → Upcoming economic events (next 2 hours)
  → historicalQuery: null (populated by QueryAnalyst step)
- Runs in parallel with Extractor + portrait fetch

QUERY ANALYST (Haiku) — NEW
- Gated on: extracted.query_type === "historical_analysis"
- Input: natural language question + trading timezone + current date
- Output: SELECT-only SQL with chain-of-thought reasoning
- Enriched schema: semantic column descriptions, not just types
- Self-correction: if SQL errors, retries once with error message
- psychology-only questions (query_subtype = "psychology") skip SQL entirely
- SQL executed via Supabase RPC run_analytics_query()
  → Validates SELECT-only, injects user_id, enforces LIMIT 100
  → Requires one-time setup: docs/setup-analytics-function.sql
- Results injected into context.historicalQuery before Buddy runs

ANALYST (Haiku)
- Input: extracted trade + context packet
- Output: violations, warnings, patterns
- Detects: rule violations, revenge trading,
  overtrading, loss streaks, execution decline
- Runs only when has_trade = true
- AI judgment only — no hardcoded pattern rules

BUDDY (Haiku default, Sonnet for interventions)
- Input: extracted + context (incl. historicalQuery) + analyst findings + state + traderPortrait
- Output: one natural reply only, no JSON ever
- Owns: tone, empathy, personality, timing
- For historical queries: tells the story behind the numbers
  (max_tokens bumped to 500 when historicalQuery present)
- Receives living trader portrait — never references it directly
- Never references memory directly
- Never gives financial advice

Agent principle:
- AI owns all judgment calls
- Our code owns all data operations
- Never hardcode trading behavior logic

SAVE DETECTOR (Haiku)
- Input: full conversation history + buddy reply
- Output: save_trade boolean + trade_data
- One job: detect if minimum fields exist
- Minimum fields: instrument, direction, pnl,
  opened_at, emotion_tag
- execution_score: optional (asked last, never blocks save)
- Never judges data quality
- Never detects patterns
- Duplicate prevention via [SYSTEM: Trade already saved]
  messages in conversation history

SCRIBE (Haiku)
- Runs after every Buddy response — fire-and-forget, never blocks
- Input: message, buddy reply, extracted, context, last 8 messages,
  existing memories, tradingTimezone
- Output: string[] — plain text observations (no weight, no type)
- Writes to: Hindsight via retain() — Hindsight handles entity extraction,
  weighting, observation synthesis, and Mental Model refreshes automatically
- Always includes day of week (TODAY IS: Monday) — enables time-anchored
  psychology recall ("what's my psychology on Mondays?")
- Includes weekday name in observations when pattern is time-specific
- The all-knower — builds psychological portrait of trader over time
- Sees everything. Writes only what matters.
- Never writes what happened — writes what it means
- should_write: false is valid and frequent — silence is discipline
- If memory has Buddy implication, adds [Buddy: specific note] inline

## Buddy Rules — CRITICAL
- Never reference memory directly — FEEL understood not watched
- WRONG: "You mentioned your wife is sick"
- RIGHT: "How's everything at home?"
- Never say "I remember" or "your data shows"
- Empathy first, analysis second
- Never give signals or financial advice
- Only surface POSITIVE progress comparisons — never negative
- Compare trader to THEIR OWN past only — never other users
- Reflection feels like therapy, not homework
- Never force trade completion — always offer a choice
- After a bad trade, Buddy reads the room first
- Discipline comes from relationship, not locked features
- Gentle nudge always beats a mandatory gate
- Collect fields in order: instrument → direction →
  pnl → times → prices → emotion → followed_plan
  → execution_score (last, triggers save)

## Current Build Status
- ✅ Auth, middleware, onboarding, dashboard,
     BuddyChat component, voice
- ✅ Trade journal UI, journal API, trade drawer,
     soft delete, incomplete badge
- ✅ 6-agent pipeline live (Extractor, Context,
     Analyst, Buddy, SaveDetector, Scribe)
- ✅ Hindsight gen2 memory — semantic recall, Mental Models,
     trader portrait via reflect(), Directives
- ✅ Session management (daily reset, 20-message history)
- ✅ Conversation history (20 messages)
- ✅ Trades saving with all fields
- ✅ Duplicate prevention via system messages
- ✅ Shared JSON parser across all agents
- ✅ Background Analyst (non-blocking)
- ✅ Trading timezone support
- ✅ Settings page (timezone, buddy name,
     personality, account setup, notifications)
- ✅ Rules manager (NL rules, AI enforcement,
     violation tracking, sidebar badge)
- ✅ Agent fixes (retry logic, parser fix,
     Analyst injection, trade collision handling,
     max_tokens, emotion_tag consistency)
- ✅ Test suite: 71/71 passing (parser, extractor, analyst, scribe, save-detector, pipeline, chat-scenarios, scribe-direct)
- ✅ Conversational Analytics — Query Agent, text-to-SQL, self-correction loop,
     Buddy storytelling, Supabase RPC executor (requires setup-analytics-function.sql)
- ✅ Scribe time-anchoring — day of week in every observation,
     enables "what's my psychology on Mondays?" recall
- ✅ Psychology data layer — psychology_log (Scribe writes per message, deduped),
     daily_ai_notes (Haiku, cached, smart staleness check via trade/obs timestamps)
- ✅ Daily AI Note — generated from trades + psychology_log, regenerates when new
     data arrives, cached forever for past days, null when no trading activity
- ✅ Scribe dedup — today's psychology_log injected into existingMemories,
     max 1 memory per run, semantic duplicate detection
- ✅ Performance Stats page (/stats) — 12 KPI cards (PnL, Win Rate, Profit Factor,
     Expectancy, Sharpe, Max Drawdown, Recovery Factor, Consistency Score, Streak),
     equity curve + drawdown overlay, daily PnL bars, trade distribution histogram,
     by instrument/day of week/hour of day, rolling profit factor (edge decay),
     psychology section (emotion vs PnL, plan adherence, execution score),
     13-week calendar heatmap. Filter: 7D | MTD | 30D | 3M | All. Default 30D.
- ✅ Economic Calendar (/news) — TradingView embed widget, country filter buttons
     (USA/EUR/GBP/JPY/CAD/AUD), localStorage persistence, high-impact only
- ⬜ Streak card on /dashboard hardcoded "0 days" — fix later
- ⬜ OpenAI TTS — replace Web Speech Synthesis (plan in IDEAS.md)
- ⬜ News alerts
- ⬜ Confession Mode (voice recording post-trade)
- ⬜ Tauri desktop app

## Coding Rules
- TypeScript always, no any types
- Tailwind only, no inline styles
- try/catch always, loading + error states always
- NEVER expose ANTHROPIC_API_KEY to frontend
- Initialize Anthropic client INSIDE request handler not module level
- Dark mode default
- Server components default, client only when needed
- Never hardcode trading behavior or judgment logic
- All pattern detection → Analyst agent
- All conversation decisions → Buddy agent
- All data extraction → Extractor agent
- Our code = infrastructure only
- Agent behavior is controlled by prompt instructions,
  never by hardcoded logic
- Before adding code to an agent → try prompt first

## Windows/PowerShell Notes
- Quotes for paths with parentheses: "app/(auth)"
- New-Item not touch
- Git always from root tradingbrew/ folder
- System env vars override .env.local — dangerous
- Check: [System.Environment]::GetEnvironmentVariable("KEY", "User")

## Golden Rules
1. One feature complete before next
2. Ship fast, get users, everything follows
3. Web first, Tauri after validation
4. Never build outside the bible
5. Refactor don't rebuild
6. Instructions before code — before writing
   any logic, ask: "Can Claude handle this
   with better prompt instructions?"
   If yes → update the prompt. If no → write code.
   90% of the time the answer is yes.
