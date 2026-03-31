# Known Bugs & Issues

---

## [2026-03-29] Premature save — fields missing from saved trade

SaveDetector fires as soon as 5 minimum fields appear in the 20-message window. User provided all fields (rr, followed_plan, execution_score, etc.) but saved trade only had exit time + pnl + direction. Fields that arrive after the save are dropped — only execution_score has a late-patch.

---

## [2026-03-29] Exit time saved as entry time

Saved trade shows `closed_at` (exit time) instead of `opened_at` (entry time). Entry time is the minimum requirement, not exit time. Extractor likely maps "got out at X" / "exited at X" into `opened_at` instead of `closed_at`.

---

## [2026-03-29] Wrong direction on saved trade

Trader says "short" but trade saves as "long". Extractor misreading direction in some message patterns.

---

## [2026-03-29] Dirty test data pollutes Analyst

Test trades with absurd values ($3 trillion NQ PnL, closed_at before opened_at) in trades table. Analyst burns tokens warning about data integrity on every request.

---

## [2026-03-29] Hindsight out of credits

`recall()` and `reflect()` returning 402. Buddy running with no memories and no trader portrait.
