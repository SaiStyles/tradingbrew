# Analyst Tab — Manual Test Cases

All tests are text-only. Type into the **Analyst tab** input. No voice needed.

**How to read results:** Buddy's reply is the primary signal. For SQL-triggered tests, if Buddy cites actual numbers from your trade history, QueryAnalyst fired correctly.

**Session 2026-04-05 status:** 13/22 tests passed manually. Remaining 9 need rules data + goals data populated first.

---

## GROUP 1 — Casual Chat (no SQL, no data fetch)

| # | Type this | Expected | Status |
|---|-----------|----------|--------|
| A1 | `hey how's it going` | Short warm Buddy reply. No trade data referenced. Fast. | ✅ PASS |
| A2 | `I'm feeling good today` | Buddy acknowledges casually. No numbers, no SQL. | ✅ PASS |

---

## GROUP 2 — Context-Based (today's data, no SQL)

| # | Type this | Expected | Status |
|---|-----------|----------|--------|
| A3 | `how have I been doing today?` | Buddy references today's trades and P&L from Context. | ✅ PASS |
| A4 | `what rules do I have active?` | Buddy lists active rules from Context. | ✅ PASS |

---

## GROUP 3 — Historical Data Queries (QueryAnalyst fires)

| # | Type this | Expected | Status |
|---|-----------|----------|--------|
| A5 | `how do I do on Mondays?` | Buddy cites actual Monday trade stats. | ✅ PASS |
| A6 | `what's my win rate on NQ?` | Buddy gives NQ win rate + context. | ✅ PASS |
| A7 | `show me my worst trades` | Buddy describes worst trades by P&L. | ✅ PASS |
| A8 | `what's my best instrument?` | Buddy compares instruments by avg P&L. | ⬜ NEEDS DATA |
| A9 | `how did I trade last week?` | Buddy gives weekly summary with numbers. | ⬜ NEEDS DATA |

---

## GROUP 4 — Psychology Queries (psychology_log)

| # | Type this | Expected | Status |
|---|-----------|----------|--------|
| A10 | `what's my biggest weakness?` | Buddy draws from Scribe observations, not just numbers. | ✅ PASS |
| A11 | `am I a revenge trader?` | Buddy gives honest pattern read from psychology_log. | ✅ PASS |
| A12 | `how's my psychology been lately?` | Buddy gives psychological portrait from recent observations. | ✅ PASS |

---

## GROUP 5 — Rules Queries (critical — regex fix tested here)

| # | Type this | Expected | Status |
|---|-----------|----------|--------|
| A13 | `did I break any rules today?` | Buddy tells which rules were violated (rule_violations SQL). | ✅ PASS |
| A14 | `what's my most broken rule?` | Buddy ranks rules by violation count. | ⬜ NEEDS RULES DATA |
| A15 | `rules are for man` | **Buddy gives casual reply. No SQL fires. No data fetch.** | ✅ PASS |

A15 is the critical test for the regex removal we did — casual "rules" mention must NOT trigger QueryAnalyst.

---

## GROUP 6 — Implicit Pattern Detection (observation → SQL)

| # | Type this | Expected | Status |
|---|-----------|----------|--------|
| A16 | `I feel worse on Mondays` | Buddy fetches Monday trade data and validates or challenges the feeling. | ✅ PASS |
| A17 | `NQ always kills me` | Buddy fetches NQ history and responds with data + empathy. | ✅ PASS |
| A18 | `I've been struggling this week` | Buddy fetches weekly data and responds. | ✅ PASS |

---

## GROUP 7 — Goals Queries

| # | Type this | Expected | Status |
|---|-----------|----------|--------|
| A19 | `am I on track with my goals this week?` | Buddy fetches current week goals and gives progress. | ⬜ NEEDS GOALS DATA |
| A20 | `how many goals did I complete last week?` | Buddy gives last week's completion count. | ⬜ NEEDS GOALS DATA |

---

## GROUP 8 — Combined Trade + Psychology

| # | Type this | Expected | Status |
|---|-----------|----------|--------|
| A21 | `how did I trade on Monday?` | Buddy gives both trade numbers AND psychological observations for that day. | ⬜ NEEDS DATA |

---

## GROUP 9 — No-Save Guarantee (explorer NEVER saves)

| # | Type this | Expected | Status |
|---|-----------|----------|--------|
| A22 | `I took NQ long, made 500, felt confident` | Buddy responds conversationally. Check /journal — zero new trades added. | ✅ PASS |

Terminal confirmed: `[save-detector] result: {"save_trade":false}` — SaveDetector never runs in explorer mode.

---

## Known Weakness — B1 (see BUGS.md)

Weekly/DOW pattern queries: Buddy currently asks a follow-up question ("What happens on Mondays specifically?") instead of leading with data when QueryAnalyst results are present.

- A5 (`how do I do on Mondays?`) passed because the question is explicit.
- A16 (`I feel worse on Mondays`) passed with data + empathy.
- Multi-week summary queries (A9, A18) may deflect. Fix pending in buddy.ts prompt.

---

## Pass Criteria

| Test | Key check |
|------|-----------|
| A1/A2 | No numbers, no data, casual tone |
| A5–A9 | Buddy cites real numbers from trade history |
| A10–A12 | Buddy draws from psychology observations |
| A13/A14 | Rule violation data surfaces |
| A15 | No SQL, casual reply — critical |
| A16–A18 | Implicit trigger works, data + empathy combo |
| A19/A20 | Goals data present in Buddy's reply |
| A22 | /journal unchanged after trade described in Analyst tab |
