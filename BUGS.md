# Known Bugs & Issues

---

## ~~[2026-03-29] Buddy hallucinating "system's locked to certain queries"~~ FIXED 2026-04-01

Added hard rule to buddy.ts: never reference system limitations or capability limits. Respond naturally or ask a follow-up instead.

---

## [2026-03-29] Dirty test data pollutes Analyst

Test trades with absurd values ($3 trillion NQ PnL, closed_at before opened_at) in trades table. Analyst burns tokens warning about data integrity on every request. Fix: delete bad rows from Supabase trades table manually.

---

## [2026-03-29] Hindsight out of credits

`recall()` and `reflect()` returning 402. Buddy running with no memories and no trader portrait. Fix: top up Hindsight credits at vectorize.io.

---

## ~~[2026-04-01] Streak card hardcoded 0 days~~ FIXED 2026-04-04

Dashboard streak card now computes real streak from last 30 days of trades. Logic ported from StatsClient.tsx.

---

## [2026-04-01] Voice latency floor ~2.5-3s — irreducible with current stack

Voice-to-voice chain is 3 sequential API calls that can't be parallelized:
Whisper STT (~900ms) → Buddy stream first token (~400ms) → TTS first sentence (~600ms) = ~1.9s minimum, plus VAD silence (1000ms) and context fetch.

**Root cause:** Hindsight `recallMemories` is on the critical path inside `runContext`. If Hindsight is slow or degraded, it delays Buddy by 500ms-2s on every message.

**Solutions (pick one or both):**
1. **Race condition on recall** — give `recallMemories` a 400ms window in `context.ts`. If it wins, memories included. If not, Buddy starts without them. Zero regression when Hindsight is fast. Memories appear next turn when slow.
   - Change: wrap `recallMemories` call in `Promise.race([recallMemories(...), new Promise(r => setTimeout(() => r([]), 400))])`
2. **Pre-fetch DB context on speech start** — fire DB queries (trades, rules, account, news) when `onSpeechStart` fires in `useWhisperSTT.ts`, before Whisper even finishes. Saves ~200ms from the critical path. Hindsight recall still needs the message text so can't be pre-fetched.
   - Change: expose a `prefetchContext` function from route or a new `/api/buddy/context` endpoint, call it from `onSpeechStart` in BuddyChat.tsx, pass pre-fetched result into the main `/api/buddy` call.

Going below ~2s voice-to-voice requires a WebSocket architecture with streaming STT + streaming TTS all wired together — a significant rebuild, post-launch consideration.

---


## [2026-04-02] Vercel deployment — MIDDLEWARE_INVOCATION_FAILED

Site deployed to Vercel but returns 500 on every request. Root cause not yet confirmed.
Env vars verified present with correct names (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY etc).
Middleware is standard Supabase SSR pattern — should not crash if env vars are set.
**Next session:** check Vercel function logs for the actual runtime error. May need a fresh redeploy.

---

## [2026-04-05] Analyst: weekly/DOW pattern queries — Buddy deflects instead of leading with data

**Observed:**
- "I feel worse on Mondays" → Buddy asks "What happens on Mondays specifically?" instead of showing Monday trade stats
- "I've been struggling this week" → Buddy responds with context numbers but doesn't break down the weekly pattern with SQL data

**Expected:** QueryAnalyst fires, SQL runs (DOW filter or date range), Buddy leads with actual data then follows up conversationally.

**Likely cause:** QueryAnalyst fires and returns results, but Buddy treats the implicit observation as a conversation opener and asks a clarifying question before answering. Buddy prompt needs a hard rule: "If historicalQuery has results, lead with the data — don't ask for clarification first."

**Priority:** Medium. Data is there, Buddy just doesn't use it confidently.

---

## [2026-04-01] Test suite requires --no-file-parallelism

Running `npx vitest run` without the flag causes concurrent API calls to hit the 50 RPM Haiku rate limit, causing random test failures. Always run: `npx vitest run --no-file-parallelism`. This is already set in vitest.config.ts via `fileParallelism: false` so it should apply automatically.

---

## [2026-04-05] NewsEvent type uses `event_name` but DB column is `title`

**Location:** `web/types/trade.ts` — `NewsEvent` interface has `event_name` field.
DB column is `title` (confirmed in project_db_schema.md). `query-analyst.ts` already uses `title` correctly.

**Impact:** `context.ts` selects `*` from `news_events` — raw data comes back with `title`. When `buddy.ts` renders upcoming news using `n.event_name` it gets `undefined`. Buddy still knows "high impact USD event in 30 minutes" but not its name. "FOMC Rate Decision in 30 minutes" is significantly more useful.

**Fix needed (two lines):**
1. `web/types/trade.ts` — rename `event_name: string` → `title: string` in `NewsEvent` interface
2. `web/app/api/buddy/agents/buddy.ts` — replace `n.event_name` (or `event.event_name`) → `n.title`

**Priority:** Low — event timing + impact still surfaces. Name is bonus context.

---

## [2026-04-05] QueryAnalyst latency — ~8.5s total for historical queries

Explorer pipeline now runs QueryAnalyst on every message (gate removed). For casual chat, QueryAnalyst returns `needs_sql:false` cheaply (~50 tokens). For historical queries, full SQL generation adds ~1-2s on top of normal Buddy latency.

**Observed:** `[agents] total: 8497ms` for a combined trade SQL + psychology_sql query.

**Not a bug per se** — correctness tradeoff for reliability. Gate removal fixed the `win rate on NQ` miss.
Acceptable at current user scale. If latency becomes user-facing issue, solutions:
1. Stream Buddy while QueryAnalyst runs in parallel (requires restructure)
2. Re-introduce a lighter gate (Extractor query_type, but fix the prompt so it's reliable)

**Priority:** Low — correctness matters more than latency for now.
