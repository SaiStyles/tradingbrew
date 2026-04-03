# TradingBrew 🎙️
> Just speak. We handle the rest.

## What This Is
TradingBrew is a passive AI trading recorder — not a chatbot, not a journal app, not a signal provider.
Traders speak naturally while they trade. The system listens, logs, analyses, and delivers insights silently.
Nobody wants to talk to AI. They want to talk to limbo — and have limbo quietly handle everything.

## Core UX — The Recorder
- **Recorder is the front door** — vintage tape reel animation, mic always listening
- Trader mumbles trades naturally while watching charts — no commands, no chat
- Pipeline runs silently in background: extract → save → analyse → observe
- End of session: summary delivered via Telegram/Discord — no login needed
- Chat exists but is secondary: pure exploration tool, never for logging

## What It Is NOT
- Not a chatbot — nobody asked for that
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
- Frontend: Next.js 15, TypeScript, TailwindCSS, Framer Motion, Recharts 3.8.1
- Backend: Next.js API routes, Node.js
- Database: Supabase (PostgreSQL)
- Auth: Supabase Auth
- Storage: Supabase Storage
- AI Agents: 9-agent pipeline (7 reactive + 2 proactive)
  → Extractor (Haiku) — field extraction + query_type detection
  → Context (Pure TS, no AI) — data fetching from Supabase + Hindsight recall
  → QueryAnalyst (Haiku) — text-to-SQL for historical questions, gated on query_type
  → Analyst (Haiku) — pattern detection, background
  → Buddy (Haiku always) — natural conversation, plain text
  → SaveDetector (Haiku) — save decision
  → Scribe (Haiku) — psychological memory builder, fires post-response via after()
  → ProactiveGate (Haiku) — inner thoughts: should_speak + mode decision
  → ProactiveBuddy (Haiku) — unprompted message generation, 9 modes
- Agent Parser: shared lib/claude/parser.ts
- Memory: Hindsight (gen2 agentic memory) — semantic recall, Mental Models, reflect()
- Database Facts: Supabase PostgreSQL (trades, rules, accounts)
- Voice: OpenAI Whisper STT (Recorder input only) — LIVE. TTS removed from Chat path (cost + complexity, not worth it).
  ElevenLabs later for character voices if Recorder ever needs audio feedback.
- Messaging: Telegram bot for end-of-session summaries — BUILT (Session 17)
  → /api/telegram (webhook), /api/telegram/connect (GET/DELETE), /api/telegram/summary (POST)
  → User connects via Settings → Notifications → "Connect Telegram" → one-time token deep link
  → "End Session" button in Recorder tab sends summary to linked chat
  → Env vars: TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_NAME, TELEGRAM_WEBHOOK_SECRET
  → One-time setup: run docs/add-telegram.sql + register webhook (instructions in SQL file)
  → Discord: free API, same pattern — post-launch if demand exists
- Deployment: Vercel
- Desktop: Tauri (5MB, lighter than Electron) — post-launch

## Buddy Personality System — KEY FEATURE
- User can choose ANY personality — viral hook
- Default options: Friendly Mentor, Drill Sergeant, Zen Master, Gordon Gekko
- Custom: user types anything — "Jack Sparrow", "Gordon Gekko", "Batman" — Claude adapts fully
- Stored in users.buddy_personality
- Personality in text only — already works today
- Later: matching ElevenLabs voice — character voices from ElevenLabs community library
- NEVER real celebrity voice cloning — legal risk. "Jack Sparrow voice" = stylistic approximation, not Johnny Depp
- Buddy name customizable → users.buddy_name
- Viral hook: combo of character voice + character text = screenshot moments ("greed is good, but that stop loss wasn't")
- Low cost (Haiku) = low barrier = big user base = acquisition proof for firm sales

## Voice Design — Recorder Only
- Recorder has vintage tape reel animation — circles when speech detected
- STT: OpenAI Whisper via /api/stt — WAV blobs sent on speech end
- TTS: REMOVED from Chat. No voice replies. Recorder is one-way: speak → silent processing.
- VAD: Silero VAD WASM via @ricky0123/vad-web (MicVAD) — ML-based
  → positiveSpeechThreshold: 0.5, negativeSpeechThreshold: 0.35
  → minSpeechMs: 250, redemptionMs: 900, preSpeechPadMs: 150
  → Requires COOP/COEP headers (next.config.ts) + ONNX WASM files in /public
  → Dynamic import inside async fn — avoids SSR module resolution failure
- Chat tab: text only. No mic, no voice, no TTS. Clean.
- lib/voice/silenceDetector.ts — DELETED. lib/voice/getMimeType.ts — DELETED.
- Voice selector in Settings: deprecated (no TTS output to select for)

## Pricing
- Launch: FREE — build users first
- Later: Free (30 trades) | Pro $19/month (unlimited + all features)

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
- users (buddy_name, buddy_personality, buddy_voice_id, trading_timezone)
- accounts (NOT prop_firm_accounts — supports prop/personal/live/demo + nickname)
- trades (includes account_id)
- screenshots, rules, rule_violations, emotions
- goals, streaks, milestones, memories, progress
- news_events, user_news_interactions, sessions
- DROPPED: prop_firm_accounts, content_feed
- NOTE: psychological profile columns (tilt_trigger, primary_edge, buddy_approach etc.)
  are dead — Hindsight Mental Models own this now, do not write or read them

## Memory Architecture — CURRENT (Session 8)
- **Supabase** → FACTS (trades, rules, accounts) — unchanged
- **Hindsight** → PSYCHOLOGICAL MEMORY (gen2, replaces memories table)
  → `lib/memory/hindsight.ts` — singleton client
  → `retain()` — Scribe writes plain text observations, async processing
  → `recall()` — Context fetches relevant memories per message (semantic, budget: mid)
  → `reflect()` — called once per trading day, returns living trader portrait for Buddy
  → Mental Models — 4 auto-refreshing psychological questions per user bank:
      tilt_trigger, primary_edge, buddy_approach, blind_spots
  → Directives — 3 hard rules enforced on every reflect():
      no direct memory reference, no financial advice, empathy first
- **Bank ID**: `tradingbrew-{userId}` — per user, auto-created on first message
- **Env vars**: HINDSIGHT_BASE_URL + HINDSIGHT_API_KEY (cloud or self-hosted)
- **Trader Portrait**: reflect() result cached in session state, refreshed each trading day
  → Buddy receives as "WHO THIS TRADER IS" section in system prompt
  → Empty for new users, activates as Scribe builds observations
- Supabase memories table still exists in schema but is no longer written to

## Agent Architecture — 9 Agent Pipeline

**Two distinct pipelines — enforced in route.ts via mode: 'recorder' | 'explorer':**

**Recorder pipeline** (voice input, silent operation):
- Extractor (lean prompt) → Context → Analyst(bg) + SaveDetector (parallel) → Scribe (after())
- No Buddy. No portrait fetch. No QueryAnalyst. Trade saves silently.
- SaveDetector: single-pass, decides on extracted fields alone — no conversation loop.
- Returns SSE with done event only (no token stream).

**Analyst pipeline** (text input, exploration only):
- Extractor (full prompt, query_type detection) + Context → QueryAnalyst (if needed) → Buddy stream → Scribe (after())
- NO SaveDetector. Never saves trades. Extractor runs for query_type/subtype only — has_trade ignored.
- Portrait fetch runs — Buddy needs it.
- Returns SSE with token stream + done event.

**Proactive pipeline** (fires without user prompting):
- ProactiveGate + ProactiveBuddy → called on BuddyChat mount + Vercel cron (Phase 2)

Every buddy message runs through this pipeline:

EXTRACTOR (Haiku)
- Input: raw user message + trading timezone
- Output: structured JSON fields only
- Also detects: query_type ("historical_analysis" | null)
  and query_subtype ("data" | "psychology" | "both" | null)
- query_type fires on BOTH explicit questions ("how do I do on Mondays?") AND
  implicit pattern observations ("I feel worse on Mondays", "NQ always kills me",
  "been struggling this week") — expanded this session
- No history, no personality, pure extraction
- Runs on every message

CONTEXT (Pure TypeScript — no AI call)
- Input: user_id + trading timezone + current message
- Output: context packet containing:
  → Relevant memories via Hindsight recall() (semantic, query = current message)
  → Today's trades summary + P&L
  → Active rules
  → Account info
  → Upcoming economic events (next 2 hours) — NOTE: news tab is standalone TradingView embed, not connected to Buddy. This context data comes from news_events table only.
  → historicalQuery: null (populated by QueryAnalyst step)
- Runs in parallel with Extractor + portrait fetch

QUERY ANALYST (Haiku) — NEW
- Gated on: extracted.query_type === "historical_analysis"
- Input: natural language question + trading timezone + current date
- Output: SELECT-only SQL with chain-of-thought reasoning
- Enriched schema: semantic column descriptions, not just types
- Self-correction: if SQL errors, retries once with error message
- psychology-only questions (query_subtype = "psychology") skip SQL entirely
- SQL executed via Supabase RPC run_analytics_query()
  → Validates SELECT-only, injects user_id, enforces LIMIT 100
  → Requires one-time setup: docs/setup-analytics-function.sql
- Results injected into context.historicalQuery before Buddy runs

ANALYST (Haiku)
- Input: extracted trade + context packet
- Output: violations, warnings, patterns
- Detects: rule violations, revenge trading,
  overtrading, loss streaks, execution decline
- Runs when has_trade = true OR session has prior messages
- AI judgment only — no hardcoded pattern rules
- Fully background — violations written via .then() callback, never blocks streaming response
- One turn behind by design: Buddy uses previous turn's analysis (Analyst runs parallel to Buddy stream)

BUDDY (Haiku always — Sonnet escalation removed)
- Input: extracted + context (incl. historicalQuery) + analyst findings + state + traderPortrait
- Output: one natural reply only, no JSON ever
- Owns: tone, empathy, personality, timing
- For historical queries: tells the story behind the numbers
  (max_tokens bumped to 500 when historicalQuery present)
- Receives living trader portrait — never references it directly
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
  opened_at, emotion_tag
- execution_score: optional (asked last, never blocks save)
- Never judges data quality
- Never detects patterns
- Duplicate prevention via [SYSTEM: Trade already saved]
  messages in conversation history

SCRIBE (Haiku)
- Runs after every Buddy response — fire-and-forget, never blocks
- Input: message, buddy reply, extracted, context, last 8 messages,
  existing memories, tradingTimezone
- Output: string[] — plain text observations (no weight, no type)
- Writes to: Hindsight via retain() — Hindsight handles entity extraction,
  weighting, observation synthesis, and Mental Model refreshes automatically
- Always includes day of week (TODAY IS: Monday) — enables time-anchored
  psychology recall ("what's my psychology on Mondays?")
- Includes weekday name in observations when pattern is time-specific
- The all-knower — builds psychological portrait of trader over time
- Sees everything. Writes only what matters.
- Never writes what happened — writes what it means
- should_write: false is valid and frequent — silence is discipline
- If memory has Buddy implication, adds [Buddy: specific note] inline

PROACTIVE GATE (Haiku) — NEW
- Inner thoughts layer. Decides whether Buddy should speak unprompted.
- Input: trigger_type + trader portrait + session stats + lastProactiveAt + daysSinceLastSeen
- Output: { should_speak: boolean, mode: ProactiveMode, reason: string }
- Hard rate limit: never fires twice within 30 minutes
- For session_start: route-level guard skips if session already has messages today
- 9 modes: greet, celebrate, check_in, intervene, debrief, reconnect, milestone, quiet, banter
- Silence is better than noise — when in doubt, should_speak = false

PROACTIVE BUDDY (Haiku) — NEW
- Generates the actual proactive message once gate says should_speak = true
- Input: mode + trader portrait + context + tradingDate + user (name/personality/tz)
- Output: plain text, 1-3 sentences, full personality applied
- Each mode has specific stage directions — emotional context, not a script
- greet: first open of day, Jarvis moment
- celebrate: meaningful win acknowledgment
- check_in: after a loss, presence not analysis
- intervene: 3+ losses or drawdown — "I need to say something"
- debrief: session winding down, one final honest word
- reconnect: returning after 3+ days, no guilt
- milestone: streak/best day, specific not generic
- quiet: in app 20+ min with nothing said
- banter: slow day, pure in-character entertainment, retention through delight
- Called from: /api/buddy/proactive (Phase 1) + /api/proactive-check cron (Phase 2)

## Buddy Rules — CRITICAL
- Use what you know naturally — "Yeah that's a pattern for you" not "you mentioned on March 3rd..."
- Never quote dates, timestamps, or file back anything verbatim from memory
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
- ✅ 7-agent pipeline live (Extractor, Context, QueryAnalyst,
     Analyst, Buddy, SaveDetector, Scribe)
- ✅ Hindsight gen2 memory — semantic recall, Mental Models,
     trader portrait via reflect(), Directives
- ✅ Session management (daily reset, 20-message history)
- ✅ Conversation history (20 messages)
- ✅ Trades saving with all fields
- ✅ Duplicate prevention via system messages
- ✅ Zod runtime validation on all agent outputs — parseWithSchema() replaces unsafe JSON casts
- ✅ Centralised agent interfaces (BuddyParams, SaveDetectorParams, ScribeParams,
     QueryAnalystParams, QueryAnalystOutput) in types/trade.ts
- ✅ Immutable context — enrichedContext spread, never mutates original ContextPacket
- ✅ Shared JSON parser + parseWithSchema across all agents
- ✅ Background Analyst (non-blocking)
- ✅ Trading timezone support
- ✅ Settings page (timezone, buddy name,
     personality, account setup, notifications)
- ✅ Rules manager (NL rules, AI enforcement,
     violation tracking, sidebar badge)
- ✅ Agent fixes (retry logic, parser fix,
     Analyst injection, trade collision handling,
     max_tokens, emotion_tag consistency)
- ✅ Test suite: 113/113 passing — run with `npx vitest run --no-file-parallelism`
     (fileParallelism:false in config; sequential required to stay under 50 RPM rate limit)
- ✅ Conversational Analytics — Query Agent, text-to-SQL, self-correction loop,
     Buddy storytelling, Supabase RPC executor (requires setup-analytics-function.sql)
- ✅ Scribe time-anchoring — day of week in every observation,
     enables "what's my psychology on Mondays?" recall
- ✅ Psychology data layer — psychology_log (Scribe writes per message, deduped),
     daily_ai_notes (Haiku, cached, smart staleness check via trade/obs timestamps)
- ✅ Daily AI Note — generated from trades + psychology_log, regenerates when new
     data arrives, cached forever for past days, null when no trading activity
- ✅ Scribe dedup — today's psychology_log injected into existingMemories,
     max 1 memory per run, semantic duplicate detection
- ✅ Performance Stats page (/stats) — 12 KPI cards (PnL, Win Rate, Profit Factor,
     Expectancy, Sharpe, Max Drawdown, Recovery Factor, Consistency Score, Streak),
     equity curve + drawdown overlay, daily PnL bars, trade distribution histogram,
     by instrument/day of week/hour of day, rolling profit factor (edge decay),
     psychology section (emotion vs PnL, plan adherence, execution score),
     13-week calendar heatmap. Filter: 7D | MTD | 30D | 3M | All. Default 30D.
- ✅ Economic Calendar (/news) — TradingView embed widget, country filter buttons
     (USA/EUR/GBP/JPY/CAD/AUD), localStorage persistence, high-impact only
- ✅ OpenAI TTS (tts-1) — replaces Web Speech Synthesis. Streams audio/mpeg via Web Audio API.
     6 selectable voices in Settings. BuddyChat uses AudioContext + ArrayBuffer playback.
- ✅ OpenAI Whisper STT — replaces Web Speech API input. MediaRecorder + VAD silence detection.
     Sends audio to /api/stt on silence. Hallucination filter on server side.
- ✅ Sentence-parallel TTS — speak() splits reply into sentences, fires all TTS fetches in
     parallel, plays in order. Near-zero gap between sentences.
- ✅ TTS generation counter (speakGenRef) — prevents two concurrent speak() calls from
     fighting. New call cancels old one cleanly mid-sentence.
- ✅ Silero VAD WASM — replaces amplitude SilenceDetector. ML-based speech detection.
     @ricky0123/vad-web + onnxruntime-web@1.24.3. COOP/COEP headers in next.config.ts.
     ONNX + worklet files in /public. Dynamic import pattern for SSR safety.
- ✅ Extractor implicit pattern detection — query_type now fires on observations like
     "I feel worse on Mondays", not just explicit questions. 20/20 tests passing.
- ✅ emotion_tag normalization in trade insert — filters to valid enum only, prevents
     Supabase CHECK constraint violations
- ✅ _debug_trade_error in /api/buddy response — surfaces Supabase insert errors to
     DevTools Network tab for debugging. Remove once trade saving is confirmed working.
- ✅ Test suite: 113/113 passing (added 11 proactive agent tests, improved prompt
     robustness for save-detector + query-analyst + analyst; sequential file execution
     required via fileParallelism:false to stay under 50 RPM rate limit)
- ✅ Trade saving to Supabase — CONFIRMED WORKING.
- ✅ Trades table schema expansion — done. Added: setup_type, session_time,
     market_condition, risk_amount, r_multiple, exit_reason.
- ✅ Proactive Buddy — full 9-agent system. Buddy speaks first on session open.
     Phase 1 (free): /api/buddy/proactive GET, called on BuddyChat mount.
     Phase 2 (Vercel Pro): /api/proactive-check cron, every minute, Supabase Realtime push.
     9 modes: greet, celebrate, check_in, intervene, debrief, reconnect, milestone, quiet, banter.
     proactive_queue + proactive_log tables: run docs/add-proactive-tables.sql (DONE).
     CRON_SECRET env var needed in Vercel dashboard when upgrading to Pro.
- ✅ daily_portraits cache — reflect() result cached in Supabase once per user per day.
     Prevents reflect() from firing on every new device/tab. Run docs/add-daily-portraits.sql.
- ✅ Buddy prompt — "system's locked to certain queries" hallucination fixed.
     Hard rule added: never reference system limitations or capability limits.
     Extended: "don't have access to" banned. Correct phrasing: "I've only seen today so far".
- ✅ SSE streaming response — /api/buddy returns text/event-stream. Text appears at ~0.5s TTFT.
     Tokens streamed as `data: {"type":"token","text":"..."}` events. Done event triggers save/Scribe.
- ✅ Streaming TTS — BuddyChat detects sentence boundaries during token stream (extractCompleteSentences),
     fires TTS fetch per sentence immediately, playStreamingSentences plays ordered promise array live.
     First audio plays before Buddy finishes generating. Near-zero gap between sentences.
- ✅ Analyst fully decoupled from streaming — violations registered via .then() callback on analystPromise.
     Never blocks SSE response. Buddy uses previous turn's analysis (one turn behind by design).
- ✅ ensureBank once per session — session flag `ensureBank_called` prevents duplicate Hindsight
     bank-creation calls. Reduced from 2 calls/message to 1 call/session lifetime.
- ✅ max_tokens reduced — Extractor: 150, Analyst: 300, SaveDetector: 200, Scribe: 300, QueryAnalyst: 400.
     Buddy unchanged (300 regular / 500 with historicalQuery).
- ✅ Recorder + Analyst UI — BuddyChat split into two tabs. Recorder tab: vintage tape reel SVG,
     voice input, silent pipeline, recent captures log. Analyst tab: text-only chat, SSE streaming.
     Toggle at top of card. Defaults to Recorder.
- ✅ TTS fully removed from Analyst/chat path — text only, no voice output, no AudioContext.
     All speak/playBuffer/playStreamingSentences/fetchTTSBuffer code deleted from BuddyChat.
- ✅ Pipeline split by mode — route.ts gates agents by mode: 'recorder' | 'explorer' (internal name).
     Recorder: Extractor + Context + Analyst(bg) + SaveDetector + Scribe. No Buddy, no portrait.
     Analyst tab: Context + QueryAnalyst + Buddy stream + Scribe. No Extractor, no SaveDetector.
- ✅ Portrait fetch gated to Analyst tab only — Recorder skips reflect() entirely. Saves 500ms-2s
     on first recorder message of the day.
- ✅ Extractor mode-aware prompt — Recorder gets lean prompt (~40% fewer tokens, no query_type logic).
     Explorer/Analyst gets full prompt unchanged.
- ✅ SaveDetector mode-aware prompt — Recorder gets single-pass prompt (extracted fields only,
     decisive save). Analyst tab: SaveDetector never runs. Explorer never saves trades.
- ✅ Test suite updated for SSE — route-integration tests now parse SSE stream via parseSSE() helper.
     122/123 passing (1 pre-existing flaky personality test, unrelated to changes).
- ✅ Analyst full DB access — QueryAnalyst now generates optional psychology_sql alongside
     trade SQL for date-specific queries. Route runs both, merges results. Buddy receives
     trade data + Scribe observations for the period. "How did I trade on April 1st?" returns
     trades + what Scribe observed about the trader's psychology that day.
- ⬜ Streak card on /dashboard hardcoded "0 days" — fix later
- ✅ Telegram end-of-session delivery — BUILT (Session 17)
     Connect in Settings → Notifications → deep link → /start token → chat_id stored.
     End Session button in Recorder tab → POST /api/telegram/summary → sends formatted summary.
     Requires: docs/add-telegram.sql + webhook registration + 3 env vars.
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
