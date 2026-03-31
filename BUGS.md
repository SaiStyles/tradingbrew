# Known Bugs & Issues

---

## [2026-03-29] Buddy hallucinating "system's locked to certain queries"

Buddy sometimes says "the system doesn't support that query" as an excuse when it doesn't know the answer. Should just respond from what it knows — never reference system limitations.

---

## [2026-03-29] Dirty test data pollutes Analyst

Test trades with absurd values ($3 trillion NQ PnL, closed_at before opened_at) in trades table. Analyst burns tokens warning about data integrity on every request.

---

## [2026-03-29] Hindsight out of credits

`recall()` and `reflect()` returning 402. Buddy running with no memories and no trader portrait.
