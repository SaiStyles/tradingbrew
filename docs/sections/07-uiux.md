# 07 — UI/UX Flow

## Screens

### 1. Landing Page (PUBLIC)
- Hero: "Jarvis for Traders"
- One line pitch
- Demo video or animation
- CTA: "Start Free"
- No pricing page (free at launch)

### 2. Onboarding Flow
```
Step 1 → Name + Email + Password
Step 2 → Trading style (futures/forex/stocks)
Step 3 → Platform they use
Step 4 → Name your buddy (default: Brew)
Step 5 → Set your rules (max trades, max loss)
Step 6 → Prop firm details (optional)
Step 7 → Install Chrome extension prompt
Step 8 → Done → Enter app
```

### 3. Main Dashboard
```
Layout:
┌─────────────────────────────────┐
│  TradingBrew        [Settings]  │
├──────────┬──────────────────────┤
│          │                      │
│ Sidebar  │   Main Content       │
│          │                      │
│ - Home   │   [Buddy Chat]       │
│ - Trades │                      │
│ - Stats  │                      │
│ - Rules  │                      │
│ - News   │                      │
│          │                      │
└──────────┴──────────────────────┘
```

### 4. Buddy Chat (PRIMARY SCREEN)
- Full screen chat interface
- Voice button (hold to speak)
- Buddy responses in text + spoken
- Trade log appears inline when trade detected
- News alert banner at top when event approaching
- Always visible, always accessible

### 5. Trade Journal
- List of all trades
- Filter by: date, instrument, emotion, P&P
- Each trade card shows:
  - Instrument + direction
  - Entry/exit/PnL
  - Emotion tag
  - Execution score
  - Screenshot thumbnails
  - Voice note playback
- Click trade → full detail view

### 6. Trade Detail View
```
┌─────────────────────────────────┐
│ NQ Long — Jan 15, 9:42 AM      │
├─────────────────────────────────┤
│ Entry: 19840  Exit: 19780       │
│ SL: 19800     PnL: -$240        │
│ Size: 1       Duration: 16 min  │
├─────────────────────────────────┤
│ Screenshots:                    │
│ [15m] [5m] [1m]                 │
├─────────────────────────────────┤
│ Emotion: Hesitant               │
│ Execution: 7/10                 │
│ Followed Plan: Yes              │
├─────────────────────────────────┤
│ Voice Note: ▶ Play              │
│ Notes: "Wasn't confident..."    │
└─────────────────────────────────┘
```

### 7. Performance Dashboard
- Win rate chart (line over time)
- PnL chart (cumulative)
- Best/worst instruments (bar chart)
- Session performance (heatmap)
- Emotion vs performance correlation
- Rule violations over time
- Current streak
- Milestones achieved

### 8. Rules Manager
- List of active rules
- Toggle on/off
- Add new rule
- Rule types:
  - Max trades per day
  - Max risk per trade
  - Max daily loss
  - Allowed sessions
  - No trading during news

### 9. News Feed
- Upcoming events list
- High/medium/low impact tags
- Time until event countdown
- Historical performance on this event type

### 10. Content Feed
- X/Twitter trader stories
- Market moments
- Inspiring content
- Trader feuds/drama
- Categorized and filterable

### 11. Settings
- Profile details
- Buddy name
- Voice settings
- Timezone
- Prop firm accounts
- Notification preferences
- Connected accounts

---

## Key UX Principles
- Voice button always visible and accessible
- Buddy response always comes first — never a blank screen
- Dark mode default (traders trade at night)
- Minimal clicks to log a trade — max 2
- Never show a form unless absolutely necessary
- Mobile responsive even before native mobile app

---

## States To Handle
- Loading state — buddy thinking animation
- Empty state — new user, no trades yet
- Error state — API down, voice not working
- Offline state — no internet
- Market closed state — buddy in rest mode
- News alert state — banner + buddy speaks
