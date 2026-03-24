# TradingBrew — Current Status
> Last updated: 2026-03-24 (Session 5)

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
  - `recall()` in Context — semantic retrieval per message
  - `retain()` in Scribe — async, Hindsight handles entity extraction + observation synthesis
  - `reflect()` — trader portrait fetched once per trading day, cached in session
  - Mental Models — 4 living psychological questions per user bank
  - Directives — 3 hard rules baked into every reflect()
- **Context agent fully upgraded (Session 5)**:
  - 7-day trade history — weekly PnL, win rate, trade count
  - Today win rate + avg PnL computed inline
  - Current streak (win/loss) derived from daily PnL grouping
  - Account fetch gets any account type (not just prop)
  - 5s timeout with dataError flag
  - Buddy system prompt shows week stats, streak, account info
- **Bugs fixed (Session 5)**:
  - SaveDetector buddyReply removed (dead param)
  - Step 1 has 4s timeout — no more infinite hangs
  - dataError flag surfaces failed fetches to Buddy
  - select('*') on users replaced with explicit columns
- Session management (daily reset, 20-message history)
- Duplicate trade prevention via [SYSTEM: Trade already saved] markers
- Shared JSON parser + retry logic on all agents
- Trading timezone support
- Settings page (timezone, buddy name, personality, account, notifications)
- Rules manager (NL rules, AI enforcement, violation tracking, sidebar badge)
- Haiku/Sonnet routing (Buddy uses Haiku for non-trade messages)
- Test suite: 46 tests (all pass when credits available)

### DB — Clean as of Session 5
- Dead psychological profile columns dropped from users table
- `memories` table dropped (replaced by Hindsight)
- `milestones`, `progress`, `emotions` tables dropped (never used)

### Pending / Not Built
- Performance dashboard
- Chart screenshots (Lightweight Charts + yahoo-finance2)
- News alerts + event-driven Buddy triggers
- X/Twitter watchlist (user-defined accounts)
- ElevenLabs voice (V2)
- Tauri desktop app (V2, post-launch)

---

## Agent Pipeline

```
Message received
    ↓
Step 1: Load profile + session (4s timeout)
    ↓
Step 2: Extractor (Haiku) + Context (pure TS) + Portrait (reflect) — ALL parallel
    - Context: today trades + 7-day history + rules + account + news + Hindsight recall()
    - Portrait: reflect() with 3s timeout, cached per trading day
    ↓
Step 3: Buddy + Analyst + SaveDetector — ALL parallel
    - Buddy: Sonnet if has_trade or active violations, else Haiku
    - Analyst: runs if has_trade OR todaysTradeCount >= 3
    - SaveDetector: runs if has_trade OR session.messages.length > 0
    ↓
Step 4: Write rule violations (fire-and-forget)
Step 5: Save trade if SaveDetector says so
Step 6: Persist session state
Step 7: Return response to client
    ↓ (after response sent)
Step 8: Scribe → retain() to Hindsight (async, fire-and-forget)
```

---

## Memory Architecture

- **Supabase `trades` table** — facts (instrument, pnl, entry, exit, emotion, execution)
- **Hindsight** — psychological memory (gen2)
  - Bank ID: `tradingbrew-{userId}`
  - Mental Models (4): tilt_trigger, primary_edge, buddy_approach, blind_spots
  - Directives (3): no direct memory reference, no financial advice, empathy first
- **Env vars**: HINDSIGHT_BASE_URL + HINDSIGHT_API_KEY

---

## Stack
- Frontend: Next.js 15, TypeScript, TailwindCSS, Framer Motion
- DB: Supabase (PostgreSQL) — clean, no dead tables
- AI: Anthropic API (Haiku + Sonnet)
- Memory: Hindsight gen2
- Deploy: Vercel
- Tests: Vitest (`npm test`)
- Repo: github.com/SaiStyles/tradingbrew
