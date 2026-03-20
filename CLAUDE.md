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
- ✅ Auth, middleware, onboarding, dashboard, BuddyChat component, Claude API route
- 🔧 Claude API key env issue (system env var overriding .env.local — fix: hardcode temporarily)
- ⬜ Buddy chat working, trade journal, news alerts, performance dashboard, Mem0, Tauri

## Coding Rules
- TypeScript always, no any types
- Tailwind only, no inline styles
- try/catch always, loading + error states always
- NEVER expose ANTHROPIC_API_KEY to frontend
- Initialize Anthropic client INSIDE request handler not module level
- Dark mode default
- Server components default, client only when needed

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