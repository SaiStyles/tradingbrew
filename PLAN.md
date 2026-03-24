# TradingBrew — Plan
> Last updated: 2026-03-24 (Session 6)

## Session 6 — DONE ✅
- Full agent prompt overhaul (all 5 agents)
- Buddy: PATTERN CLAIMS guard, HISTORICAL DATA, SYSTEM marker awareness, judgment-based refs
- Analyst: system/user split + cache_control, valid intervention_type enum, hardcoded gate removed
- SaveDetector: execution_score optional, duplicate prevention tightened to 4-field match
- Extractor: prices removed, has_trade tightened, emotion normalization
- Scribe: WRITE/DON'T WRITE examples, 3-memory cap
- `last_trade_id` + late execution_score patching in route
- Settings API security fix (field whitelist)
- price fields (entry_price, exit_price, stop_loss) removed from full pipeline
- Chart screenshots: decided against (CME futures data gap, not worth the effort)
- Chat scenario stress test: 15 tests across 10 real-world scenarios — all pass

## Session 5 — DONE ✅
- Context agent fully upgraded (7-day history, weekly stats, streak, win rate, avg PnL)
- Account fetch fixed (any account type, not just prop)
- 5s timeout + dataError flag on context
- Step 1 (profile + session) now has 4s timeout — no infinite hangs
- SaveDetector buddyReply removed (dead param, never used in decision)
- select('*') on users replaced with explicit columns
- DB cleaned: dead psychological columns dropped, memories/milestones/progress/emotions tables dropped
- Buddy system prompt now shows week stats, streak, account info, dataError warning

---

## Critical Bugs — ALL FIXED ✅
1. ~~SaveDetector receives empty buddyReply~~ — removed, was dead weight
2. ~~Context errors silent~~ — dataError flag added, Buddy warned
3. ~~No Supabase query timeouts~~ — 4s on Step 1, 5s on Context

---

## Backlog (In Order)

1. ✅ Memory architecture upgrade (Hindsight gen2)
2. ✅ Fix 3 critical bugs
3. ✅ Historical context (7-day trades, weekly stats, streak)
4. ~~Chart screenshots~~ — abandoned
5. Performance dashboard
6. News alerts (news_events table already exists)
7. Event-driven Buddy (news trigger + end-of-day debrief)
8. X/Twitter watchlist (user-defined accounts, trading + personal)
9. Tauri desktop app (V2, post-launch)
10. ElevenLabs voice (V2)

---

## Next Session — Start Here

1. Read STATUS.md + CLAUDE.md + PLAN.md
2. Build performance dashboard (traders need to see their stats — daily habit driver)
3. Then: News alert triggers (news_events table exists, just needs Buddy hook)
4. Then: Event-driven Buddy (end-of-day debrief)
