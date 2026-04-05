# Manual Test Checklist

## Recorder (voice — test when alone)

| # | Say this | Expected |
|---|----------|----------|
| 1 | "NQ short, lost 400, entered 9:30am, felt frustrated" | Saves. All fields. incomplete=false |
| 2 | "made 300 on NQ" | Saves. incomplete=true (no direction, no time) |
| 3 | "ES long, lost 200, entered 10am" | Saves. emotion_tag=null. incomplete=false |
| 4 | "NQ long during New York session, made 500, entered 9:30, stopped out, felt confident" | session='new_york', exit_reason='Stop out' |
| 5 | "took NQ long made 400 then shorted ES lost 200" | Only FIRST trade saves (NQ long 400) |
| 6 | "ES short, lost 150, entered 11am, felt nervous" | emotion_tag='hesitant' (near-miss map) |

Check in Supabase `trades` table after each — verify fields match.

---

## Analyst tab (text — test now, no voice needed)

| # | Type this | Expected |
|---|-----------|----------|
| 1 | "how have I been trading lately?" | Buddy responds with recent context |
| 2 | "how did I do on Mondays?" | QueryAnalyst fires, Buddy tells the story |
| 3 | "what's my biggest weakness?" | Psychology response from Scribe observations |
| 4 | "hey how's it going" | Short casual Buddy reply, no trade data |

---

---

## Recorder — Text Fallback Tests (type into Recorder tab input, no voice needed)

**How:** Open app → Recorder tab → type phrase → Send → check "Recent captures" (✓ = saved, "heard" = not saved) → verify fields in /journal

### Group 1 — Basic Save

| # | Type this | Expected in Recent captures | Check in /journal |
|---|-----------|----------------------------|-------------------|
| T1 | `Bought NQ long at 9:30am, made 450 dollars, felt confident, 7 out of 10 execution, followed my plan, stopped out` | ✓ | instrument=NQ, direction=long, pnl=450, opened_at set, emotion_tag=confident, execution_score=7, followed_plan=true, exit_reason=stop out — no incomplete badge |
| T2 | `ES trade, lost 200` | ✓ | pnl=-200, incomplete badge visible |
| T3 | `Shorted crude oil, down 350 on the trade` | ✓ | direction=short, pnl=-350 |

### Group 2 — Emotion Normalization

| # | Type this | Expected emotion_tag |
|---|-----------|----------------------|
| T4 | `Traded NQ long, made 300, felt nervous the whole time` | hesitant |
| T5 | `Closed ES short for 150 profit, was really angry at myself` | frustrated |
| T6 | `Bought gold, made 80, felt bizarre` | null (trade still saves) |
| T7 | `NQ long, lost 120, pure FOMO trade` | FOMO |

### Group 3 — Session Normalization

| # | Type this | Expected session |
|---|-----------|-----------------|
| T8 | `ES long in the London session, made 200` | london |
| T9 | `NQ short during New York session, lost 300` | new_york |
| T10 | `Gold long in London-NY overlap, breakeven trade` | overlap, pnl=0 |

### Group 4 — Exit Reason

| # | Type this | Expected exit_reason |
|---|-----------|----------------------|
| T11 | `Bought MNQ, got stopped out, lost 75` | contains "stop" |
| T12 | `NQ long, hit my target, made 600` | contains "target" |
| T13 | `Closed NQ early manually, took 200` | contains "manual" |

### Group 5 — Multiple Trade Guard (critical)

| # | Type this | Expected |
|---|-----------|----------|
| T14 | `Bought NQ, made 400. Then shorted ES for 150 loss.` | ONE entry only — NQ pnl=400. /journal shows 1 new trade, not 2 |

### Group 6 — No-Save Scenarios

| # | Type this | Expected |
|---|-----------|----------|
| T15 | `I've been really distracted today, can't focus` | "heard" — no trade in journal |
| T16 | `NQ is looking weak right now, might short later` | "heard" — no trade in journal |

### Group 7 — Edge Cases

| # | Type this | Expected |
|---|-----------|----------|
| T17 | `ES long, made 300, execution was 11 out of 10` | ✓ — execution_score=10 (clamped from 11) |
| T18 | `NQ short, lost 200, didn't follow my plan at all` | ✓ — followed_plan=false |
| T19 | `Traded ES long, got out at breakeven` | ✓ — pnl=0 |
| T20 | Re-send T1 exact phrase after it already saved | "heard" — no duplicate in journal |

---

## TradeDrawer — Incomplete Badge Rules (as of 2026-04-05)

| Path | Saves when | Incomplete badge when |
|------|-----------|----------------------|
| Recorder | instrument + pnl present | opened_at OR direction missing |
| Drawer (new) | instrument + direction + pnl + opened_at present (all enforced) | never |
| Drawer (edit/PATCH) | always | opened_at OR direction missing after merge |

**Flow:** Recorder saves with minimum → incomplete badge → trader opens drawer → fills direction + entry time → badge clears.

---

## Notes
- Recorder voice tests need mic → do when alone
- Recorder text fallback tests (T1-T20) → do anytime, no mic needed
- T1 + T2 confirmed passing (2026-04-05)
- Priority order for remaining: T14 → T4/T5 → T8/T9 → T20
- calcIncomplete lives in TWO files — `api/trades/route.ts` (POST) and `api/trades/[id]/route.ts` (PATCH) — both now identical: `!opened_at || !direction`
