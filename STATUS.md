# TradingBrew — Current Status
> Last updated: 2026-03-22

## What This Is
AI trading companion (Jarvis for traders). Web app built on Next.js 15 + Supabase + Anthropic API.
4-agent pipeline: Extractor → Context → Analyst + Buddy + SaveDetector (all parallel).

---

## Build Status

### Done and Working
- Auth, middleware, onboarding, dashboard
- BuddyChat component with voice (Web Speech API)
- Trade journal UI — list, drawer, soft delete, incomplete badge
- 4-agent pipeline fully live and saving trades correctly
- Mem0 long-term memory (writes + reads, dated insights)
- Session management (daily reset, 20-message history)
- Duplicate trade prevention via [SYSTEM: Trade already saved] markers
- Shared JSON parser (parseJSON + parseAnalystOutput bracket-matching)
- Retry logic on all agents (429/503/529/500 + network errors)
- Trading timezone support
- Settings page (timezone, buddy name, personality, account, notifications)
- Rules manager (NL rules, AI enforcement, violation tracking, sidebar badge)
- Prompt caching on Buddy and SaveDetector system prompts
- Haiku/Sonnet routing (Buddy uses Haiku for non-trade messages with no active violations)

### In Progress / Pending
- Performance dashboard (next major feature per CLAUDE.md)
- News alerts
- Richer Mem0 session summaries (currently writes sparse per-trade strings — should write full session summaries)
- Tauri desktop app (post-launch, V2)

---

## Agent Pipeline (as of 2026-03-22)

```
Message received
    ↓
Step 1: Load profile + session from Supabase (parallel)
    ↓
Step 2: Extractor (Haiku) + Context (no model) — parallel
    ↓
Step 3: Buddy + Analyst + SaveDetector — ALL parallel
    - Buddy: Sonnet if has_trade or active violations, else Haiku
    - Analyst: runs if has_trade OR todaysTradeCount >= 3
    - SaveDetector: runs if has_trade OR session.messages.length > 0
    ↓
Step 4: Write violations (fire-and-forget)
Step 5: Save trade if SaveDetector says so
Step 6: Write Mem0 memories (fire-and-forget)
Step 7: Persist session state to Supabase
Step 8: Return response
```

**Key files:**
- `web/app/api/buddy/route.ts` — orchestrator
- `web/app/api/buddy/agents/` — extractor, context, analyst, buddy, save-detector
- `web/lib/claude/parser.ts` — shared JSON parser
- `web/lib/claude/retry.ts` — withRetry utility

---

## Known Issues / Watch Points
- Buddy receives previous turn's analysis (last_analysis), not current — violations missed on the exact turn they're detected (by design due to parallel execution, acceptable trade-off)
- SaveDetector duplicate check is fuzzy string match — format variation (e.g. $400 vs 400.0) could theoretically bypass it. No secondary Supabase check exists.
- Mem0 session summaries are sparse — only per-trade strings written, no full session narrative

---

## Recent Changes (this session)
- Fixed: SaveDetector gate was too strict — `extracted.has_trade` alone broke multi-turn collection
- Fixed: execution_score now clamped to 1–10 (was rounding 10.7 → 11)
- Fixed: 429 rate limit now retried (was silently crashing)
- Fixed: New trading day now inserts fresh session row instead of overwriting previous day's record
- Fixed: `never[]` dead type removed from ContextPacket
- Fixed: Dead `pending` parameter removed from runAnalyst
- Fixed: SaveDetector and session history windows aligned (both 20 messages)
- Fixed: Analyst gate restored to include todaysTradeCount >= 3
- Perf: All 3 of Buddy + Analyst + SaveDetector now run in parallel (was sequential)
- Perf: Haiku routing for Buddy on simple messages
- Perf: Prompt caching on SaveDetector

---

## Next Session — Start Here
1. Read this file first
2. Check CLAUDE.md for full product spec and architecture rules
3. Next feature to build: **Performance Dashboard**
   - Per-instrument breakdown
   - Win rate, avg PnL, execution score trends
   - Emotion pattern analysis
   - All data from Supabase trades table

---

## Stack Quick Reference
- Frontend: Next.js 15, TypeScript, TailwindCSS
- DB: Supabase (PostgreSQL)
- AI: Anthropic API (Haiku + Sonnet)
- Memory: Mem0 (long-term insights)
- Deploy: Vercel
- Repo: github.com/SaiStyles/tradingbrew
