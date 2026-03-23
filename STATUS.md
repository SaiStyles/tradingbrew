# TradingBrew — Current Status
> Last updated: 2026-03-23 (Session 3)

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
- Scribe agent — psychological memory builder, fires post-response via `after()`, never blocks
- Memory: Supabase weight-ranked retrieval (top 10 by weight DESC, created_at DESC)
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
- **Agentic memory upgrade** — researching best approach (living memory, semantic search, Mem0 vs custom)
- Performance dashboard
- News alerts
- Chart screenshots (Lightweight Charts + yahoo-finance2 — designed, not built)
- Tauri desktop app (post-launch, V2)
- ElevenLabs voice (V2)

---

## Agent Pipeline (as of 2026-03-23)

```
Message received
    ↓
Step 1: Load profile + session from Supabase (parallel)
    ↓
Step 2: Extractor (Haiku) + Context (pure TS, no AI) — parallel
    ↓
Step 3: Buddy + Analyst + SaveDetector — ALL parallel
    - Buddy: Sonnet if has_trade or active violations, else Haiku
    - Analyst: runs if has_trade OR todaysTradeCount >= 3
    - SaveDetector: runs if has_trade OR session.messages.length > 0
    ↓
Step 4: Write rule violations (fire-and-forget)
Step 5: Save trade if SaveDetector says so
Step 6: Persist session state to Supabase
Step 7: Return response to client
    ↓ (after response sent)
Step 8: Scribe fires via after() — writes memories to Supabase
```

**Key files:**
- `web/app/api/buddy/route.ts` — orchestrator
- `web/app/api/buddy/agents/` — extractor, context, analyst, buddy, save-detector, scribe
- `web/lib/claude/parser.ts` — shared JSON parser
- `web/lib/claude/retry.ts` — withRetry utility
- `web/__tests__/` — full test suite (vitest)

---

## Memory Architecture — CURRENT STATE

- **Supabase `trades` table** — facts (instrument, pnl, entry, exit, emotion, execution)
- **Supabase `memories` table** — insights written by Scribe
  - Columns: `content`, `weight` (1-10), `buddy_instruction`, `memory_type`, `created_at`
  - Retrieved by: weight DESC + created_at DESC (top 10)
  - No embeddings currently — weight-ranked only
- **Scribe** writes memories post-response. Sees existing top 10 memories. Decides what to write.
- **Context** fetches top 10 and passes as strings to Buddy + Analyst

## Memory Architecture — OPEN DECISION

Current system has gaps:
- No semantic retrieval (weight+recency only — misses synonym patterns)
- No memory consolidation/dedup (Scribe tries via prompt, not code-enforced)
- No temporal decay (old memories don't fade)

Options under research:
1. **Living memory** — Scribe outputs inserts + updates (designed, not built)
2. **Mem0 managed** — swap Supabase memories for Mem0 API (free tier: 50K memories)
3. **pgvector + embeddings** — semantic search via OpenAI text-embedding-3-small (was in original plan)
4. **Hybrid** — Scribe writes to Mem0, keep Supabase for everything else

**Decision pending user research on best agentic memory system.**

---

## Known Issues / Watch Points
- Buddy receives previous turn's analysis (last_analysis), not current — by design (parallel execution)
- `memory_type` column in Supabase memories table — Scribe no longer outputs a type field. Route inserts NULL or needs a default.
- Session cached_memories — stores strings. If memory architecture changes to objects, session cache needs migration.

---

## Recent Changes (Session 3)
- Added Scribe agent (psychological memory builder, fires via `after()`)
- Removed Mem0 entirely — replaced with Supabase weight-ranked query in Context
- Removed `lib/memory/memory.ts` and `lib/memory/mem0.ts` (dead code)
- Removed `profile_updates` from ScribeOutput — Scribe writes freely, no rigid schema
- Fixed incomplete flag bug (`!td.closed_at` removed — closed_at always synthesized)
- Fixed Scribe double-slice bug
- Built full test suite: 46 tests across 6 files, all passing
- Added `npm test` script to package.json

## Recent Changes (Session 2)
- Replaced Mem0 with Supabase pgvector + OpenAI embeddings — zero per-call cost
- Fixed: [object Object] in memory writes — Analyst now outputs plain strings
- Fixed: Buddy off-topic rigidity — now engages warmly then redirects

---

## Next Session — Start Here
1. Read STATUS.md + CLAUDE.md
2. **Decision needed:** Which memory architecture? (See open decision above)
3. Once memory is decided → build it
4. Then: Chart screenshots (Lightweight Charts + yahoo-finance2)
5. Then: Performance dashboard

---

## Stack Quick Reference
- Frontend: Next.js 15, TypeScript, TailwindCSS, Framer Motion
- DB: Supabase (PostgreSQL)
- AI: Anthropic API (Haiku + Sonnet)
- Memory: Supabase weight-ranked (pgvector available but not active)
- Deploy: Vercel
- Tests: Vitest (npm test)
- Repo: github.com/SaiStyles/tradingbrew
