# 03 — Feature Modules

## Core Layer (Always On)

### 1. Voice Journal
- Trader speaks trade details naturally after closing
- AI extracts: instrument, entry, exit, SL, P&L, direction
- Buddy confirms extracted data verbally
- Trader corrects if wrong
- Entry stored automatically
- **Done when:** Trade logged via voice in under 60 seconds

### 2. AI Buddy Conversation
- Powered by Claude Sonnet (conversation) + Haiku (simple tasks)
- Asks reflection questions post trade
- Remembers everything across sessions
- Never feels like a form or survey
- Buddy name: user customizable
- **Done when:** Natural back and forth conversation works without friction

### 3. Trade Journal Storage
- Every trade stored with full details
- Voice note attached
- Screenshot attached
- Emotion tag attached
- Searchable and filterable
- **Done when:** All trade data retrievable and displayable on dashboard

### 4. TradingView Screenshot Automation
- Chrome extension detects trade logged
- Opens TradingView automatically
- Captures user's preset timeframes (e.g. 1m, 5m, 15m)
- Screenshots attached to journal entry
- **Done when:** 3 timeframe screenshots auto-attached within 30 seconds of trade log

---

## Buddy Layer

### 5. Morning Check-In
- Buddy speaks every trading morning
- Reviews today's news events
- References yesterday's performance
- Sets mental focus for the day
- **Done when:** Personalised morning brief delivered via voice daily

### 6. Pre Market Briefing
- Upcoming high impact news events
- Time, name, expected impact, previous reading
- References trader's historical performance on similar events
- **Done when:** Full briefing delivered before market open

### 7. Pre Trade Confirmation
- Before entering, trader tells buddy the plan
- Buddy confirms: instrument, direction, entry, SL, target, risk
- Checks against trader's rules
- Warns if violation detected
- **Done when:** Rule check happens before every declared trade

### 8. Post Trade Reflection
- Immediately after trade closes
- Buddy asks: how are you feeling?
- Asks: did that follow your plan?
- Asks: rate your execution 1-10
- **Done when:** 3 reflection questions answered and stored

### 9. Post Market Debrief
- End of session spoken summary
- Trades taken, rules followed/broken
- One focus point for tomorrow
- **Done when:** 60 second spoken debrief generated accurately

### 10. Proactive Triggers (Buddy speaks without being asked)
- News approaching in X minutes
- Daily loss limit approaching
- Max trades limit hit
- Been trading too long — break reminder
- Revenge trade pattern detected
- Same mistake repeated from history
- Perfect execution acknowledgement
- Market unusually volatile
- **Done when:** All triggers fire accurately in real scenarios

---

## Psychology Layer

### 11. Emotion Tagging
- AI infers emotion from voice tone and words
- Confirms with trader: "sounds like frustration, right?"
- Tags stored per trade
- **Done when:** Emotion accurately inferred 80%+ of the time

### 12. Psychology Tracking
- Patterns detected over time
- "You revenge trade after 2 consecutive losses"
- "Your win rate drops when you feel FOMO"
- Delivered naturally in conversation not as report
- **Done when:** Patterns surface after 20+ trades

### 13. Rule Enforcement
- User defines rules once:
  - Max trades per day
  - Max risk per trade
  - Max daily loss
  - Allowed trading sessions
- Buddy enforces in real time
- **Done when:** Every rule violation caught and flagged

### 14. Prop Firm Monitor
- User inputs prop firm rules once
- Trailing drawdown tracked
- Daily loss limit tracked
- Warns at 50%, 75%, 90% of limits
- **Done when:** Real time warnings firing accurately

---

## Performance Layer

### 15. Performance Dashboard
- Win rate
- P&L over time
- Best/worst instruments
- Best/worst sessions
- Rule violations
- **Done when:** All metrics visible and accurate on dashboard

### 16. Weekly Summary
- Spoken by buddy every Friday/weekend
- Win rate, discipline score, key patterns
- One thing to improve next week
- **Done when:** Accurate weekly summary generated and spoken

### 17. Execution Rating
- After each trade: rate execution 1-10
- Separate from P&L outcome
- Tracks process quality over time
- **Done when:** Execution score tracked independently from P&L

### 18. Goal Tracking
- Weekly process goals set Monday
- Not P&L goals — process goals
- Buddy tracks and reports Friday
- **Done when:** Goal completion rate tracked weekly

### 19. Streak System
- Days without rule violations tracked
- Buddy celebrates milestones
- Non-judgmental — resets without shame
- **Done when:** Streak displayed and celebrated at 7, 14, 30 days

### 20. Milestones
- First green week
- 10 trades zero violations
- 30 day journaling streak
- Best win rate month
- **Done when:** Milestone triggered and celebrated by buddy

---

## Content Layer

### 21. News Alerts
- Economic calendar integration
- NFP, CPI, FOMC, GDP alerts
- Fires X minutes before event
- Name, time, expected impact, previous reading
- **Done when:** Alerts firing 15 minutes before every high impact event

### 22. Trader Content Feed
- X/Twitter trading stories
- Trader feuds and drama
- Community achievements
- Inspiring trader stories
- Market moments and viral content
- Delivered during slow market periods
- **Done when:** Relevant content delivered contextually during downtime

---

## Memory Layer

### 23. Deep Memory System
- Powered by Mem0
- Stores: trade patterns, emotions, personal details, goals, achievements
- Retrieved contextually before every conversation
- Never referenced directly — always felt naturally
- **Done when:** Buddy references past context naturally without feeling creepy

---

## Golden Rules For All Features
- Voice first always
- Never judgmental
- Never surveillance-feeling
- Never financial advice
- Every feature must work on web first
