# TradingBrew — Current Status
> Last updated: 2026-03-24 (Session 4)

## What This Is
AI trading companion (Jarvis for traders). Web app built on Next.js 15 + Supabase + Anthropic API.
6-agent pipeline: Extractor → Context → (Analyst + Buddy + SaveDetector parallel) → Scribe (post-response).

---

## Build Status

### Done and Working
- Auth, middleware, onboarding, dashboard
- BuddyChat component with voice (Web Speech API)
- Trade journal UI — list, drawer, soft delete, incomplete badge
- 6-agent pipeline fully live (Extractor, Context, Analyst, Buddy, SaveDetector, Scribe)
- **Hindsight gen2 memory** — fully wired:
  - `recall()` in Context — semantic retrieval per message (not top-10 static)
  - `retain()` in Scribe — async, Hindsight handles entity extraction + observation synthesis
  - `reflect()` — trader portrait fetched once per trading day, cached in session
  - Mental Models — 4 living psychological questions per user bank (auto-refresh)
  - Directives — 3 hard rules baked into every reflect()
  - Bank auto-created on first message with retainMission + observationsMission
- Buddy receives trader portrait — "WHO THIS TRADER IS" in system prompt
- Session management (daily reset, 20-message history)
- Duplicate trade prevention via [SYSTEM: Trade already saved] markers
- Shared JSON parser (parseJSON + parseAnalystOutput bracket-matching)
- Retry logic on all agents (429/503/529/500 + network errors)
- Trading timezone support
- Settings page (timezone, buddy name, personality, account, notifications)
- Rules manager (NL rules, AI enforcement, violation tracking, sidebar badge)
- Prompt caching on Buddy and SaveDetector system prompts
- Haiku/Sonnet routing (Buddy uses Haiku for non-trade messages with no active violations)
- **Test suite: 46/46 tests passing** (parser, extractor, analyst, scribe, save-detector, pipeline integration)

### Pending / Not Built
- **Historical context** — Context only sees today. No 7-day trades, streaks, goals.
- Performance dashboard
- News alerts
- Chart screenshots (Lightweight Charts + yahoo-finance2 — designed, not built)
- Tauri desktop app (post-launch, V2)
- ElevenLabs voice (V2)

---

## Agent Pipeline (as of 2026-03-24)

```
Message received
    ↓
Step 1: Load profile + session from Supabase (parallel)
    ↓
Step 2: Extractor (Haiku) + Context (pure TS) + Portrait (reflect) — ALL parallel
    - Context: fetches trades/rules/account/news + Hindsight recall(message)
    - Portrait: reflect() with 3s timeout, uses session cache if already fetched today
    ↓
Step 3: Buddy + Analyst + SaveDetector — ALL parallel
    - Buddy: Sonnet if has_trade or active violations, else Haiku
    - Buddy receives traderPortrait from reflect()
    - Analyst: runs if has_trade OR todaysTradeCount >= 3
    - SaveDetector: runs if has_trade OR session.messages.length > 0
    ↓
Step 4: Write rule violations (fire-and-forget)
Step 5: Save trade if SaveDetector says so
Step 6: Persist session state to Supabase (includes trader_portrait cache)
Step 7: Return response to client
    ↓ (after response sent)
Step 8: Scribe fires via after() → retain() to Hindsight (async)
```

**Key files:**
- `web/app/api/buddy/route.ts` — orchestrator
- `web/app/api/buddy/agents/` — extractor, context, analyst, buddy, save-detector, scribe
- `web/lib/memory/hindsight.ts` — Hindsight client (ensureBank, recall, retain, reflect)
- `web/lib/claude/parser.ts` — shared JSON parser
- `web/lib/claude/retry.ts` — withRetry utility
- `web/__tests__/` — full test suite (vitest)

---

## Memory Architecture — CURRENT STATE

- **Supabase `trades` table** — facts (instrument, pnl, entry, exit, emotion, execution)
- **Hindsight** — psychological memory (gen2, replaces Supabase memories table)
  - Bank ID: `tradingbrew-{userId}`
  - `retain()` — Scribe writes plain text observations (async: true)
  - `recall()` — Context fetches relevant memories (budget: mid, maxTokens: 2048)
  - `reflect()` — pre-session trader portrait (budget: low, 3s timeout)
  - Mental Models (4): tilt_trigger, primary_edge, buddy_approach, blind_spots
  - Directives (3): no direct memory reference, no financial advice, empathy first
  - Observation synthesis: automatic after each retain() consolidation
- **Env vars**: HINDSIGHT_BASE_URL + HINDSIGHT_API_KEY
- Supabase memories table exists in schema but is no longer used

## Psychological Profile — DEAD COLUMNS
These users table columns are no longer used. Hindsight Mental Models replaced them:
- trading_style, psychological_tendency, primary_edge, primary_blind_spot
- tilt_trigger, recovery_pattern, buddy_approach
Do NOT write to or read from these columns.

---

## Known Issues / Watch Points
- Buddy receives previous turn's analysis (last_analysis), not current — by design (parallel execution)
- Historical context missing — Context only fetches today's trades (no streaks, goals, 7-day data)
- Supabase memories table orphaned — exists in schema, never written to anymore

---

## Recent Changes (Session 4)
- Replaced Supabase weight-ranked memory with Hindsight gen2
- Installed `@vectorize-io/hindsight-client`
- Created `web/lib/memory/hindsight.ts` (ensureBank, recallMemories, retainMemory, getTraderPortrait)
- Context agent: replaced Supabase memory query with Hindsight recall()
- Scribe agent: simplified output to string[] (no weight/buddy_instruction JSON)
- Route: added trader_portrait to SessionState, reflect() in parallel, Directives + Mental Models on bank creation
- Buddy: added traderPortrait param + "WHO THIS TRADER IS" section in system prompt
- Removed memory cache from session state (recall is query-specific now)
- Fixed pre-existing violations type error (Promise.resolve wrapping)
- ScribeOutput.memories simplified from ScribeMemory[] to string[]

## Recent Changes (Session 3)
- Added Scribe agent (psychological memory builder, fires via `after()`)
- Removed Mem0 — replaced with Supabase weight-ranked query in Context
- Built full test suite: 46 tests across 6 files, all passing

---

## Next Session — Start Here
1. Read STATUS.md + CLAUDE.md
2. **Historical context** — add 7-day trades + streaks + goals to Context packet
3. Fix critical bugs from PLAN.md (SaveDetector empty buddyReply, Context silent errors, Supabase timeouts)
4. Then: Chart screenshots → Performance dashboard

---

## Stack Quick Reference
- Frontend: Next.js 15, TypeScript, TailwindCSS, Framer Motion
- DB: Supabase (PostgreSQL)
- AI: Anthropic API (Haiku + Sonnet)
- Memory: Hindsight (gen2) — HINDSIGHT_BASE_URL + HINDSIGHT_API_KEY
- Deploy: Vercel
- Tests: Vitest (npm test)
- Repo: github.com/SaiStyles/tradingbrew
