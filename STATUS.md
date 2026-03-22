# TradingBrew — Current Status
> Last updated: 2026-03-22 (Session 2)

## What This Is
AI trading companion (Jarvis for traders). Web app built on Next.js 15 + Supabase + Anthropic API.
5-agent pipeline: Extractor → Context → (Analyst + Buddy + SaveDetector all parallel).

---

## Build Status

### Done and Working
- Auth, middleware, onboarding, dashboard
- BuddyChat component with voice (Web Speech API)
- Trade journal UI — list, drawer, soft delete, incomplete badge
- 4-agent pipeline fully live and saving trades correctly
- Long-term memory — Supabase pgvector + OpenAI embeddings (replaced Mem0)
- Session management (daily reset, 20-message history)
- Duplicate trade prevention via [SYSTEM: Trade already saved] markers
- Shared JSON parser (parseJSON + parseAnalystOutput bracket-matching)
- Retry logic on all agents (429/503/529/500 + network errors)
- Trading timezone support
- Settings page (timezone, buddy name, personality, account, notifications)
- Rules manager (NL rules, AI enforcement, violation tracking, sidebar badge)
- Prompt caching on Buddy and SaveDetector system prompts
- Haiku/Sonnet routing (Buddy uses Haiku for non-trade messages with no active violations)
- Buddy off-topic warmth (engages naturally, then brings back to trading)
- Analyst outputs clean plain strings (no more [object Object] in memories)

### In Progress / Pending
- Performance dashboard (next major feature)
- News alerts
- Screenshots via Tradovate API (auto-capture after market close, V2)
- Richer session summaries written to memory
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
Step 6: Write memories to Supabase pgvector (fire-and-forget)
Step 7: Persist session state to Supabase
Step 8: Return response
```

**Key files:**
- `web/app/api/buddy/route.ts` — orchestrator
- `web/app/api/buddy/agents/` — extractor, context, analyst, buddy, save-detector
- `web/lib/claude/parser.ts` — shared JSON parser
- `web/lib/claude/retry.ts` — withRetry utility
- `web/lib/memory/memory.ts` — pgvector memory (writeMemory + readMemories)

---

## Memory Architecture
- **Supabase `trades` table** — facts (instrument, pnl, entry, exit, emotion, execution)
- **Supabase `memories` table** — insights (pgvector, OpenAI text-embedding-3-small)
- Write: after trade saves → trade insight + session summary → embedded → stored
- Read: Context agent searches by semantic similarity → top 5 → passed to Buddy
- Cost: ~$0.000001 per embedding. $10 lasts years.

**Required Supabase setup (already done):**
- `memories` table has `content text`, `embedding vector(1536)`, `created_at`
- `search_memories` SQL function exists (cosine similarity search)
- pgvector extension enabled

**Required env vars:**
- `OPENAI_API_KEY` — for embeddings only (not Claude)

---

## Known Issues / Watch Points
- Buddy receives previous turn's analysis (last_analysis), not current — by design (parallel execution)
- SaveDetector duplicate check is fuzzy string match — format variation could theoretically bypass
- No secondary Supabase duplicate check before trade insert

---

## Recent Changes (Session 2)
- Replaced Mem0 with Supabase pgvector + OpenAI embeddings — zero per-call cost
- Fixed: [object Object] in memory writes — Analyst now outputs plain strings
- Fixed: Buddy off-topic rigidity — now engages warmly then redirects
- Fixed: mem0ai peer dependency conflict with Anthropic SDK (removed)

## Recent Changes (Session 1)
- Fixed: SaveDetector gate was too strict — broke multi-turn collection
- Fixed: execution_score clamped to 1–10
- Fixed: 429 rate limit now retried
- Fixed: New trading day inserts fresh session row (was overwriting old)
- Fixed: `never[]` dead type removed from ContextPacket
- Fixed: Dead `pending` parameter removed from runAnalyst
- Fixed: SaveDetector and session history windows aligned (both 20 messages)
- Fixed: Analyst gate restored to include todaysTradeCount >= 3
- Perf: All 3 of Buddy + Analyst + SaveDetector now run in parallel
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
- DB: Supabase (PostgreSQL + pgvector)
- AI: Anthropic API (Haiku + Sonnet) + OpenAI (embeddings only)
- Memory: Supabase pgvector (replaced Mem0)
- Deploy: Vercel
- Repo: github.com/SaiStyles/tradingbrew
