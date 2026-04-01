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

## [2026-04-01] Streak card hardcoded 0 days

Dashboard streak card always shows "0 days". Real streak logic already exists in StatsClient.tsx — needs to be copied to dashboard. Low effort, low priority.

---

## [2026-04-01] Test suite requires --no-file-parallelism

Running `npx vitest run` without the flag causes concurrent API calls to hit the 50 RPM Haiku rate limit, causing random test failures. Always run: `npx vitest run --no-file-parallelism`. This is already set in vitest.config.ts via `fileParallelism: false` so it should apply automatically.
