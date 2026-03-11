# 12 — Build Phases

## Golden Rule
**One phase complete before next phase starts.
No exceptions.**

---

## Phase 1 — Foundation (Weeks 1-3)
```
Week 1:
□ Next.js project setup
□ Supabase setup (auth + database)
□ All database tables created
□ Basic auth (register/login)
□ User onboarding flow

Week 2:
□ Main dashboard layout
□ Sidebar navigation
□ Buddy chat UI (no AI yet)
□ Trade journal list screen
□ Trade detail screen

Week 3:
□ Settings screen
□ Rules manager
□ Prop firm setup screen
□ Dark mode
□ Responsive layout
```
**Phase 1 Done When:** User can register, log in, see dashboard, set rules.

---

## Phase 2 — Voice + Journal (Weeks 4-6)
```
Week 4:
□ Web Speech API integration
□ Voice input button on chat
□ Transcript displayed in chat
□ Manual trade entry form (fallback)

Week 5:
□ Claude API integration
□ Basic buddy conversation working
□ Context packet builder
□ Trade extraction from voice transcript

Week 6:
□ Trade auto-saved after voice log
□ Emotion tagging working
□ Execution score capture
□ Voice note stored per trade
```
**Phase 2 Done When:** Trader speaks a trade, buddy responds, trade is logged.

---

## Phase 3 — Screenshots (Weeks 7-8)
```
Week 7:
□ Chrome extension scaffolded
□ Extension detects trade logged (via API)
□ Opens TradingView automatically
□ Navigates to correct instrument

Week 8:
□ Timeframe switching automated
□ Screenshot capture working
□ Screenshots uploaded to S3
□ Attached to trade journal entry
```
**Phase 3 Done When:** 3 timeframe screenshots auto-attached within 30 seconds of trade log.

---

## Phase 4 — AI Brain (Weeks 9-11)
```
Week 9:
□ Mem0 integration
□ Memory storage after every trade
□ Memory retrieval before every conversation
□ Context packet includes memories

Week 10:
□ Proactive triggers implemented
□ News alert trigger
□ Loss limit trigger
□ Overtrading trigger
□ Revenge trade detection
□ Break reminder

Week 11:
□ Morning check-in working
□ Pre trade confirmation working
□ Post market debrief working
□ Rule enforcement in real time
```
**Phase 4 Done When:** Buddy proactively speaks in all trigger scenarios accurately.

---

## Phase 5 — News + Content (Weeks 12-13)
```
Week 12:
□ Economic calendar API connected
□ News events stored in database
□ News alert notifications working
□ Pre market briefing includes news

Week 13:
□ X/Twitter API connected
□ Content feed populated
□ Content delivered during downtime
□ Categories working (stories/feuds/achievements)
```
**Phase 5 Done When:** Trader alerted 15 mins before every high impact event. Content feed active.

---

## Phase 6 — Performance (Weeks 14-15)
```
Week 14:
□ Performance dashboard complete
□ All charts working
□ Win rate calculated correctly
□ PnL chart accurate
□ Session heatmap working

Week 15:
□ Weekly summary generated + spoken
□ Streak system working
□ Milestones triggering correctly
□ Goal tracking working
□ Psychology patterns surfacing
```
**Phase 6 Done When:** Full performance picture visible. Weekly summary spoken by buddy Friday.

---

## Phase 7 — Polish + Testing (Week 16)
```
□ Full user journey tested end to end
□ All edge cases handled
□ Error states working
□ Loading states smooth
□ Voice working on all major browsers
□ Performance optimised
□ Security reviewed
□ Ready for first real users
```
**Phase 7 Done When:** 10 real traders use it for one full week with zero critical bugs.

---

## Phase 8 — Windows App (Weeks 17-18)
```
Week 17:
□ Electron wrapper set up
□ Web app running in Electron
□ Native notifications working
□ System tray integration

Week 18:
□ Windows installer built
□ Auto-update system
□ Tested on Windows 10 + 11
```
**Phase 8 Done When:** TradingBrew installable as Windows desktop app.

---

## Total Timeline
```
Phase 1: Foundation         → Weeks 1-3
Phase 2: Voice + Journal    → Weeks 4-6
Phase 3: Screenshots        → Weeks 7-8
Phase 4: AI Brain           → Weeks 9-11
Phase 5: News + Content     → Weeks 12-13
Phase 6: Performance        → Weeks 14-15
Phase 7: Polish + Testing   → Week 16
Phase 8: Windows App        → Weeks 17-18
─────────────────────────────────────────
Total: 18 weeks (~4.5 months)
```

---

## Daily Schedule
```
Block 1 (2hrs) → Build new feature
Block 2 (2hrs) → Implement + test
Block 3 (1hr)  → Debug + fix
Block 4 (1hr)  → Plan tomorrow
Total: 6hrs/day focused work
```
