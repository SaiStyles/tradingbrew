# TradingBrew — Plan
> Last updated: 2026-03-24 (Session 4)

## Memory Architecture — DONE ✅
Hindsight gen2 is live. Decision closed.

---

## Critical Bugs (Still Pending)

1. **SaveDetector receives empty buddyReply** — trade saves blind to what Buddy just said
2. **Context errors silent** — failed Supabase fetch returns empty, Buddy thinks zero trades
3. **No Supabase query timeouts** — any DB slowness = infinite hang

---

## Next Up: Historical Context

Context agent currently only knows today. Adding:

| Data | Table | What Buddy Gains |
|---|---|---|
| Last 7 days of trades | `trades` | "You've had 3 losing Fridays in a row" |
| Active streaks | `streaks` | "You're on a 4-day green streak" |
| Goals | `goals` | "3 trades away from your weekly target" |

These are additive — no breaking changes, just richer context packet.

---

## Backlog (In Order)

1. ✅ ~~Memory architecture upgrade (Hindsight gen2)~~
2. Fix 3 critical bugs above
3. Historical context (7-day trades + streaks + goals)
4. Chart screenshots (Lightweight Charts + yahoo-finance2)
5. Performance dashboard
6. News alerts
7. Tauri desktop app (V2, post-launch)

---

## Next Session — Start Here

1. Read STATUS.md + CLAUDE.md + PLAN.md
2. Fix 3 critical bugs (fast wins, ~1 hour)
3. Add historical context to Context agent
4. Then: Chart screenshots
