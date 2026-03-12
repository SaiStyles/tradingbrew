# TradingBrew 🎙️
> Jarvis for traders. Always live, always watching, speaks before you ask.

---

## What This Is
TradingBrew is a live AI trading companion — not a journal app, not a signal provider.
It's a voice-native AI buddy that sits with traders during their entire session.
It proactively speaks, remembers everything, and builds a real relationship over time.

---

## What It Is NOT
- Not a signals provider
- Not a charting platform
- Not financial advice — ever
- Not competing with TradingView or any execution platform

---

## Tech Stack
- **Frontend:** Next.js 15 (App Router), TypeScript, TailwindCSS, Framer Motion
- **Backend:** Next.js API routes (server side), Node.js
- **Database:** Supabase (PostgreSQL)
- **Auth:** Supabase Auth
- **Storage:** Supabase Storage (screenshots)
- **AI:** Claude API (Sonnet for conversation, Haiku for simple tasks)
- **Voice:** Web Speech API (free, browser native) — V1
- **Memory:** Mem0
- **Deployment:** Vercel

---

## Project Structure
```
tradingbrew/
├── web/                    ← Next.js app (ALL frontend work here)
│   ├── app/                ← App router pages
│   │   ├── (auth)/         ← Login, register pages
│   │   ├── (dashboard)/    ← Main app pages
│   │   │   ├── page.tsx    ← Main dashboard
│   │   │   ├── journal/    ← Trade journal
│   │   │   ├── stats/      ← Performance dashboard
│   │   │   ├── rules/      ← Rules manager
│   │   │   └── news/       ← News feed
│   │   └── api/            ← API routes (server side)
│   │       ├── buddy/      ← AI buddy endpoints
│   │       ├── trades/     ← Trade CRUD
│   │       ├── rules/      ← Rules endpoints
│   │       └── news/       ← News endpoints
│   ├── components/         ← Reusable UI components
│   │   ├── buddy/          ← Buddy chat components
│   │   ├── journal/        ← Journal components
│   │   ├── ui/             ← Generic UI components
│   │   └── layout/         ← Layout components
│   ├── lib/                ← Utilities and helpers
│   │   ├── supabase/       ← Supabase client
│   │   ├── claude/         ← Claude API helpers
│   │   ├── memory/         ← Mem0 integration
│   │   └── voice/          ← Web Speech API helpers
│   ├── hooks/              ← Custom React hooks
│   └── types/              ← TypeScript type definitions
└── docs/                   ← Full product bible
    └── sections/           ← 12 section bible docs
```

---

## Coding Rules — ALWAYS FOLLOW
- Always use TypeScript — no `any` types
- Always use Tailwind for styling — no inline styles
- Always handle errors with try/catch
- Always use async/await not .then()
- Always add loading and error states to UI
- Never expose ANTHROPIC_API_KEY to frontend
- Never put sensitive logic in client components
- Comment any complex logic
- Use server components by default, client only when needed
- Dark mode is default — design for dark first

---

## Key Files
- `.env.local` → API keys (never commit this)
- `lib/supabase/client.ts` → Supabase browser client
- `lib/supabase/server.ts` → Supabase server client
- `lib/claude/index.ts` → Claude API wrapper
- `lib/memory/index.ts` → Mem0 memory wrapper
- `lib/voice/index.ts` → Web Speech API wrapper

---

## Database Tables (Supabase)
- `users` → trader profiles
- `trades` → all trade records
- `screenshots` → chart images per trade
- `rules` → trader defined rules
- `rule_violations` → tracked violations
- `prop_firm_accounts` → prop firm settings
- `emotions` → emotion tags per trade
- `goals` → weekly process goals
- `streaks` → discipline streaks
- `milestones` → achievements
- `memories` → AI memory storage
- `news_events` → economic calendar
- `content_feed` → X/Twitter content
- `sessions` → trading session records

---

## AI Model Routing
- Simple tasks → Claude Haiku (cheap, fast)
- Conversations → Claude Sonnet (nuanced, smart)
- Never use Opus (too expensive)

---

## Buddy Personality Rules
- Warm, never judgmental
- Never reference memory directly — make trader FEEL understood not watched
- Never say "I remember you said..."
- Always empathy first, analysis second
- Never give financial advice or signals
- Speak like a trusted senior trader friend

---

## Current Build Phase
**Phase 1 — Week 1**
- Next.js setup ✅
- Supabase setup ✅
- Auth pages (register/login)
- User onboarding flow
- Basic dashboard layout

---

## Proactive Triggers (Buddy speaks without being asked)
- News event in 15 minutes
- Daily loss limit at 75%
- Max trades limit approaching
- Trading for 3+ hours straight
- 2 consecutive losses (revenge trade risk)
- Perfect execution acknowledgement

---

## Voice Pipeline (V1)
```
User holds button → Web Speech API listens →
transcript → Claude API → response text →
Web Speech Synthesis speaks + shows text
```

---

## Golden Rules
1. One feature complete before starting next
2. Test every feature before moving on
3. Voice first — everything should be speakable
4. Never build what's not in the bible
5. When stuck — refactor, never rebuild from scratch