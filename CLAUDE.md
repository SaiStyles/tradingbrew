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
- AI Agents: 4-agent pipeline + SaveDetector
  → Extractor (Haiku) — field extraction
  → Context (Haiku) — data fetching + pgvector memory retrieval
  → Analyst (Haiku) — pattern detection, background
  → Buddy (Sonnet) — natural conversation, plain text
  → SaveDetector (Haiku) — save decision
- Agent Parser: shared lib/claude/parser.ts
- Memory: Supabase pgvector + OpenAI text-embedding-3-small (replaced Mem0)
- Database Facts: Supabase PostgreSQL (trades, rules, accounts)
- Voice V1: Web Speech API (free) + Web Speech Synthesis (free)
- Voice V2: Whisper (input) + ElevenLabs (output) — after launch
- Deployment: Vercel
- Desktop: Tauri (5MB, lighter than Electron) — V2

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
- Supabase memories table → INSIGHTS (written by Scribe agent)
  → Columns: content, memory_type, weight (1-10), buddy_instruction
  → Retrieved by weight DESC + created_at DESC (top 10)
  → No embeddings needed — weight-ranked retrieval
- Context packet per conversation: today's data + rules + prop firm + news + top 10 memories
- Backend orchestrates all — Claude never touches memory directly

## Agent Architecture — 5 Agent Pipeline

Every buddy message runs through this pipeline:

EXTRACTOR (Haiku)
- Input: raw user message + trading timezone
- Output: structured JSON fields only
- No history, no personality, pure extraction
- Runs on every message

CONTEXT (Pure TypeScript — no AI call)
- Input: user_id + today's date
- Output: context packet containing:
  → Top 10 memories by weight from Supabase memories table
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

SAVE DETECTOR (Haiku)
- Input: full conversation history + buddy reply
- Output: save_trade boolean + trade_data
- One job: detect if minimum fields exist
- Minimum fields: instrument, direction, pnl,
  opened_at, emotion_tag, execution_score
- Never judges data quality
- Never detects patterns
- Duplicate prevention via [SYSTEM: Trade already saved]
  messages in conversation history

SCRIBE (Haiku)
- Runs after every Buddy response — fire-and-forget, never blocks
- Input: message, buddy reply, extracted, context,
  last 8 messages, existing memories
- Output: memories + profile_updates (JSON only)
- Writes to: memories table + users profile columns
- The all-knower — builds psychological portrait of trader over time
- Sees everything. Writes only what matters.
- AI owns all judgment: type, weight, buddy_instruction
- Never writes what happened — writes what it means
- should_write: false is valid and frequent — silence is discipline
- Users profile columns it can update:
  trading_style, psychological_tendency, primary_edge,
  primary_blind_spot, tilt_trigger, recovery_pattern, buddy_approach

## Buddy Rules — CRITICAL
- Never reference memory directly — FEEL understood not watched
- WRONG: "You mentioned your wife is sick"
- RIGHT: "How's everything at home?"
- Never say "I remember" or "your data shows"
- Empathy first, analysis second
- Never give signals or financial advice
- Only surface POSITIVE progress comparisons — never negative
- Compare trader to THEIR OWN past only — never other users
- Reflection feels like therapy, not homework
- Never force trade completion — always offer a choice
- After a bad trade, Buddy reads the room first
- Discipline comes from relationship, not locked features
- Gentle nudge always beats a mandatory gate
- Collect fields in order: instrument → direction → 
  pnl → times → prices → emotion → followed_plan 
  → execution_score (last, triggers save)

## Current Build Status
- ✅ Auth, middleware, onboarding, dashboard, 
     BuddyChat component, voice
- ✅ Trade journal UI, journal API, trade drawer, 
     soft delete, incomplete badge
- ✅ 4-agent pipeline live (Extractor, Context, 
     Analyst, Buddy + SaveDetector)
- ✅ Memory: Supabase pgvector + OpenAI embeddings (replaced Mem0 — zero per-call cost)
- ✅ Session management (daily reset, caching)
- ✅ Conversation history (20 messages)
- ✅ Trades saving with all fields
- ✅ Duplicate prevention via system messages
- ✅ Shared JSON parser across all agents
- ✅ Background Analyst (non-blocking)
- ✅ Trading timezone support
- ✅ Settings page (timezone, buddy name, 
     personality, account setup, notifications)
- ✅ Rules manager (NL rules, AI enforcement,
     violation tracking, sidebar badge)
- ✅ Agent fixes (retry logic, parser fix,
     Analyst injection, trade collision handling,
     max_tokens, emotion_tag consistency)
- ⬜ Performance dashboard
- ⬜ News alerts
- ⬜ Tauri desktop app 

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
- Agent behavior is controlled by prompt instructions,
  never by hardcoded logic
- Before adding code to an agent → try prompt first 

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
6. Instructions before code — before writing 
   any logic, ask: "Can Claude handle this 
   with better prompt instructions?" 
   If yes → update the prompt. If no → write code.
   90% of the time the answer is yes.