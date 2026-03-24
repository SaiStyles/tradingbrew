# TradingBrew — Memory Architecture Plan
> Last updated: 2026-03-23 (Session 4)

## Decision Status: PENDING RESEARCH

Researching memory architecture before building. Current weight-ranked retrieval works but has gaps.

---

## The Problem

Current system (`context.ts`) fetches top 10 memories by `weight DESC + created_at DESC` only.
- No semantic retrieval — misses contextually relevant old memories
- Scribe inserts only — no dedup, no updates, bloat over time
- No temporal decay
- `memory_type` column in DB is NULL on every insert (dead code)
- `embedding vector(1536)` column exists in schema but never populated

---

## Options Under Research

### Option A: pgvector DIY (hybrid)
- Scribe generates OpenAI embeddings on write → stores in `embedding` column
- Context embeds current message → fetches by cosine similarity + weight → merges
- You own everything, no new infra
- **Gap:** dedup, temporal decay, consolidation — you build and maintain forever

### Option B: Mem0 OSS (self-hosted)
- Same API as cloud Mem0 (already removed once)
- Self-host on Railway/Fly.io (~$5/mo)
- Handles: semantic search, dedup, consolidation automatically
- Laptop = dev only, need deployed instance for prod
- **Why people don't:** another service to manage

### Option C: Zep OSS (self-hosted)
- Docker-based, built for LLM conversation memory
- Natively conversation-aware (entity extraction, temporal context, summarization)
- TypeScript SDK exists
- Might fit TradingBrew better than Mem0 — conversation-first architecture
- Same infra cost as Mem0 (~$5/mo on Railway)

---

## Memory Issues to Fix (Regardless of Choice)

| # | Issue | Severity |
|---|-------|----------|
| 1 | No semantic retrieval | HIGH |
| 2 | Scribe inserts only, no dedup/updates | HIGH |
| 3 | memory_type column dead/NULL | MEDIUM |
| 4 | Memory cache breaks on schema change | MEDIUM |
| 5 | No temporal decay | MEDIUM |
| 6 | Memory bloat over time | MEDIUM |
| 7 | No hybrid retrieval | HIGH |

---

## Non-Memory Critical Bugs (Fix Regardless)

1. **SaveDetector receives empty buddyReply** — trade saves blind to what Buddy just said
2. **Context errors silent** — failed Supabase fetch returns empty, Buddy thinks zero trades
3. **No Supabase query timeouts** — any DB slowness = infinite hang

---

## Research Checklist

- [ ] Read Mem0 OSS docs — self-hosting complexity, Node.js SDK quality
- [ ] Read Zep OSS docs — conversation memory model, entity extraction relevance
- [ ] Compare: which fits the Scribe → Context write/read pattern better
- [ ] Decide: pgvector DIY vs. Mem0 OSS vs. Zep OSS
- [ ] Decide: fix critical bugs first or memory first

---

## Next Session — Start Here

1. Read STATUS.md + CLAUDE.md + PLAN.md
2. Come in with memory decision made
3. Fix critical bugs (SaveDetector, Context errors, Supabase timeouts) — fast wins
4. Build memory architecture based on decision
5. Then: Chart screenshots → Performance dashboard
