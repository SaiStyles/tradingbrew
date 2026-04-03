# WATCHOUT — Edge Case Test Questions & Priority Backlog

## Priority Backlog (ranked)

1. **Hindsight credits** — psychology layer dead without it. Every "how have I been" fails. Top up at vectorize.io. BLOCKER.
2. **Journal edit UX** — if editing a saved trade is clunky, data quality degrades. Needs to be fast (2 taps max).
3. **Psychology "lately" → psychology_log** — vague psychology questions now query psychology_log (DONE 2026-04-03). Hindsight is a bonus on top.
4. **Recorder end-to-end voice testing** — silent saves via real messy speech not battle-tested yet.
5. **Buddy Analyst tab prompt reframe** — collection behavior softened for pure exploration mode. Low impact, fine as-is for now.
6. **Run edge cases below** — confirm all pass after any QueryAnalyst/route changes.
7. **Tauri desktop app** — post-launch.

---

## Edge Case Test Questions

Use these to manually test the analytics pipeline after any changes to QueryAnalyst, route.ts, or run-analytics.ts.
Pass = Buddy returns real data or a clean "no records" response. Fail = wrong dates, hallucinated data, SQL error, or Buddy plays dumb.

---

## Date Resolution

- "what happened on March 21st" → should query 2026-03-21, not a future date
- "how did I do on the 22nd" → should resolve to most recent past 22nd (March 22), not current month future
- "what about last Tuesday" → should resolve to the most recent past Tuesday, not today or next week
- "how was my week" → should cover Monday of current week to today
- "last week breakdown" → should cover the 7 calendar days before this week's Monday
- "how have I been recently" → should cover last 14 days
- "since the start of the month" → should cover 2026-04-01 to today

---

## Day-of-Week & Hour Queries (timezone-sensitive)

- "how do I do on Mondays" → DOW extracted in trader's timezone, not UTC
- "what's my best day of the week" → timezone-aware grouping
- "what time of day do I trade best" → HOUR in trader's timezone
- "do I trade worse in the afternoon" → hour-based, timezone-aware

---

## Rules Analytics

- "what rules do I break most" → should fire historical_analysis, return rule_violations data
- "have I violated any rules this week" → rule_violations with date filter
- "which rule did I break on March 28th" → specific date + violations join
- "do I follow my rules when I'm frustrated" → data + emotion_tag filter

---

## Psychology Queries (key upgrade — these must work now)

- "how was my psychology on April 1st" → psychology_log for that date
- "what was going on in my head last week" → psychology_log for date range
- "how am I on Mondays emotionally" → psychology_log filtered by DOW
- "what has been my psychology lately" → psychology_log last 60 entries (no Hindsight needed)
- "what's my biggest weakness" → psychology_log last 60 entries, needs_sql: false
- "am I a revenge trader" → psychology_log last 60 entries, needs_sql: false

---

## Slang & Natural Language

- "what was my worst ass trade ever" → pnl < 0 ORDER BY pnl ASC LIMIT 1
- "show me my biggest blowup" → same
- "best crusher I've had" → pnl > 0 ORDER BY pnl DESC LIMIT 1
- "last trade I took" → ORDER BY opened_at DESC LIMIT 1

---

## Instrument & Comparison

- "how do I do on NQ vs ES" → group by instrument, win rate + avg pnl per instrument
- "which instrument makes me the most money" → aggregate by instrument ORDER BY total_pnl DESC
- "am I better at futures or forex" → broader grouping

---

## Aggregate / No-LIMIT Queries

- "what's my total PnL all time" → COUNT/SUM aggregate, no LIMIT needed
- "what's my overall win rate" → pure aggregate
- "how many trades have I taken total" → COUNT only

---

## Edge Cases That Have Previously Failed

- "22nd" with no month → was picking April 22nd (future). Fixed 2026-04-03.
- "what rules do I break" → was returning query_type: null. Fixed with keyword fallback 2026-04-03.
- "column rv.created_at does not exist" → rule_violations has no created_at. Fixed 2026-04-03.
- "column reference user_id is ambiguous" → JOIN queries need qualified alias. Fixed 2026-04-03.
- "how have I been lately" → was returning nothing (psychology bail-out). Fixed 2026-04-03.
