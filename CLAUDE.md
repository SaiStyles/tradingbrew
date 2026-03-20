# TradingBrew 🎙️
> Jarvis for traders. Always live, always watching, speaks before you ask.

## What This Is
TradingBrew is a live AI trading companion — not a journal app, not a signal provider.
Think Tony Stark and Jarvis — the buddy no trader has ever had.

## What It Is NOT
- Not signals, not charting, not financial advice
- Not competing with TradingView, Tradovate, Rithmic, MT4/MT5
- Not a mobile app (lowest priority, maybe never)
- Not a surveillance tool — never creepy, always warm

## Product Architecture
- Web app (Next.js) = full dashboard, journal, settings, performance
- Tauri desktop app (later) = lightweight voice companion, always on top
- Same backend, same codebase — Tauri wraps web frontend
- PWA as stepping stone before Tauri

## Tech Stack
- Frontend: Next.js 15, TypeScript, TailwindCSS, Framer Motion
- Backend: Next.js API routes, Node.js
- Database: Supabase (PostgreSQL)
- Auth: Supabase Auth
- Storage: Supabase Storage
- AI Brain: Claude Haiku (90%) + Sonnet (9%) — never Opus
- Voice V1: Web Speech API (free) + Web Speech Synthesis (free)
- Voice V2: Whisper (input) + ElevenLabs (output) — after launch
- Memory: Mem0 + PGVector
- Deployment: Vercel
- Desktop: Tauri (5MB, lighter than Electron)

- AI Agents: 4-agent pipeline (Extractor, Context, Analyst, Buddy)
- Agent Models: Haiku for Extractor/Context/Analyst, Sonnet for Buddy only
- Memory: Mem0 (long term insights) + Supabase (hard facts)

## Buddy Personality System — KEY V1 FEATURE
- User can choose ANY personality — viral hook
- Default options: Friendly Mentor, Drill Sergeant, Zen Master, Gordon Gekko
- Custom: user types anything — "Batman", "Andrew Tate" — Claude adapts
- Stored in users.buddy_personality
- V1: personality in text only
- V2: matching ElevenLabs voice
- NEVER real celebrity voice cloning — legal risk
- Buddy name customizable → users.buddy_name

## Voice Design
- Toggle ON/OFF — never always-on without consent
- Green pulsing indicator when listening
- Continuous listening when ON
- Web Speech reads every response aloud automatically

## Pricing
- V1 Launch: FREE — build users first
- V2: Free (30 trades) | Pro $19/month (unlimited + all features)

## Acquisition Target
- Buyers: Tradovate, Apex, TopStep, TradingView
- Minimum price: $10M
- Trigger: 2000+ DAU with retention data
- Strategy: approach 3-5 buyers simultaneously

## Project Structure
```
tradingbrew/
├── web/
│   ├── app/
│   │   ├── (auth)/login/ + register/
│   │   ├── (dashboard)/dashboard/  ← route fix applied
│   │   ├── onboarding/
│   │   └── api/buddy/ trades/ rules/ news/ auth/ test/
│   ├── components/buddy/ journal/ ui/ layout/
│   ├── lib/supabase/ claude/ memory/ voice/
│   ├── hooks/
│   └── types/
└── docs/sections/
```

## Database — 15 Tables
- users (buddy_name, buddy_personality, buddy_voice_id)
- accounts (NOT prop_firm_accounts — supports prop/personal/live/demo + nickname)
- trades (includes account_id)
- screenshots, rules, rule_violations, emotions
- goals, streaks, milestones, memories, progress
- news_events, user_news_interactions, sessions
- DROPPED: prop_firm_accounts, content_feed

## Memory Architecture
- Supabase → FACTS (trades, prices, rules)
- Mem0 → INSIGHTS (patterns, personality, emotional context)
- Context packet per conversation: today's data + rules + prop firm + news + top 5 memories
- Backend orchestrates both — Claude never touches Mem0 directly

## Agent Architecture — 4 Agent Pipeline

Every buddy message runs through 4 agents in sequence:

EXTRACTOR (Haiku)
- Input: raw user message + trading timezone
- Output: structured JSON fields only
- No history, no personality, pure extraction
- Runs on every message

CONTEXT (Haiku)
- Input: user_id + today's date + instrument
- Output: context packet containing:
  → Top 5 Mem0 memories (insights, patterns)
  → Today's trades summary + P&L
  → Active rules
  → Prop firm status
  → Upcoming economic events (next 2 hours)
- Runs in parallel with Extractor

ANALYST (Haiku)
- Input: extracted trade + context packet
- Output: violations, warnings, patterns
- Detects: rule violations, revenge trading,
  overtrading, loss streaks, execution decline
- Runs only when has_trade = true or 3+ trades today
- AI judgment only — no hardcoded pattern rules

BUDDY (Sonnet)
- Input: extracted + context + analyst findings + state
- Output: one natural reply only, no JSON ever
- Owns: tone, empathy, personality, timing
- Never references memory directly
- Never gives financial advice

Agent principle:
- AI owns all judgment calls
- Our code owns all data operations
- Never hardcode trading behavior logic

## Buddy Rules — CRITICAL
- Never reference memory directly — FEEL understood not watched
- WRONG: "You mentioned your wife is sick"
- RIGHT: "How's everything at home?"
- Never say "I remember" or "your data shows"
- Empathy first, analysis second
- Never give signals or financial advice
- Only surface POSITIVE progress comparisons — never negative
- Compare trader to THEIR OWN past only — never other users

## Current Build Status
- ✅ Auth, middleware, onboarding, dashboard, BuddyChat component, voice
- ✅ Trade journal UI, journal API, trade drawer, soft delete
- 🔧 Buddy agent pipeline rewrite in progress
     (moving from single call to 4-agent architecture)
- ⬜ Mem0 integration, news alerts, 
     performance dashboard, Tauri

## Coding Rules
- TypeScript always, no any types
- Tailwind only, no inline styles
- try/catch always, loading + error states always
- NEVER expose ANTHROPIC_API_KEY to frontend
- Initialize Anthropic client INSIDE request handler not module level
- Dark mode default
- Server components default, client only when needed
- Never hardcode trading behavior or judgment logic
- All pattern detection → Analyst agent
- All conversation decisions → Buddy agent
- All data extraction → Extractor agent
- Our code = infrastructure only

## Windows/PowerShell Notes
- Quotes for paths with parentheses: "app/(auth)"
- New-Item not touch
- Git always from root tradingbrew/ folder
- System env vars override .env.local — dangerous
- Check: [System.Environment]::GetEnvironmentVariable("KEY", "User")

## Golden Rules
1. One feature complete before next
2. Ship fast, get users, everything follows
3. Web first, Tauri after validation
4. Never build outside the bible
5. Refactor don't rebuild