# Ideas & Notes
> Dump ideas here so they don't get lost. No structure needed.

## ✅ Conversational Analytics (Text-to-SQL) — BUILT (Session 8)
User asks any historical question in plain English — Buddy answers with real data + Hindsight psychology.
- "How do I usually do at FOMC events?" / "What did I do on Oct 7th last year?" / "How do I trade Mondays?"
- Extractor detects query_type + query_subtype (data / psychology / both)
- Query Agent (Haiku) — chain-of-thought SQL, enriched schema, self-correction on errors
- runAnalyticsQuery — validates SELECT-only, injects user_id, LIMIT 100, Supabase RPC
- psychology-only questions skip SQL and go straight to Hindsight recall
- Buddy gets historicalQuery results, tells the story (not a spreadsheet)
- Requires one-time DB setup: docs/setup-analytics-function.sql
- Moat: every other journal shows static charts. This is just ask → get answer. Nobody has this.

## AI Note (Daily Mental Game Summary)
On the trade journal, each trading day has an "AI Note" — a short, warm paragraph describing the trader's mental game that day.
- Not clinical. Not a report. Written with grace — like a thoughtful friend reflecting on your day.
- "You came in sharp today. Took your first trade clean, held it well. The second one was where the wheels came off a little — you felt it, you said it yourself. But you didn't chase. That's the version of you worth keeping."
- Generated from: Scribe observations for that day + trade data (emotion tags, execution scores, followed_plan)
- Surfaced in the journal day view, below the trade list
- Architecture: on journal page load for a given date, call a lightweight API that pulls that day's trades + psychology_log entries → Haiku writes the note → cached in psychology_log or a separate daily_notes column
- Connects naturally to the psychology_log table idea — same data source, different surface
- Prop firms and coaches would pay for this alone

## Psychology Architecture — Two Worlds (CRITICAL — do not mix)

**Hindsight = WHO THE TRADER IS (patterns)**
- Behavioral tendencies built over months. Not per-trade, not dated.
- Written by Scribe → read by Buddy chat only (recall, reflect)
- "Tends to revenge trade after 3+ losses on NQ afternoon sessions"
- Consumer: Buddy chat. Never the journal UI.

**Supabase = WHAT HAPPENED (per-trade notes)**
- Specific, dated, queryable via SQL
- Written by Scribe (second write target — not built yet) → read by journal UI
- "On this trade: revenge mode, jumped in 2 minutes after a loss"
- Consumer: journal UI only. Never Buddy chat.

**Why they don't conflict:**
- "What's my psychology on Mondays?" → Hindsight answers. Always.
- "Show the note on my Tuesday trade" → Supabase answers. Journal reads it.

**Planned tables:**
- `psychology_log` (id, user_id, trade_id nullable, entry_date, observation) — Scribe writes here
- `daily_ai_note` (user_id, entry_date, note) — generated on journal page load, one Haiku call

**Build order:** psychology_log + Scribe second write → AI Note generation → Query Agent gains psychology_log in schema (unlocks cross-queries like "days I lost most + psychology on those days")

## Streak Card Fix (Dashboard)
The "Streak" card on `/dashboard` is hardcoded to "0 days". The real streak computation already exists in `StatsClient.tsx` — copy the logic there. Needs all-time trades query (not just today's trades which the dashboard currently fetches). Low effort, fix whenever.

## ✅ OpenAI TTS — BUILT (Session 14)
Replaced `window.speechSynthesis` with OpenAI TTS for a human-sounding Buddy voice.
- /api/tts streams audio/mpeg from OpenAI tts-1 → Web Audio API ArrayBuffer playback
- 6 selectable voices in Settings → users.buddy_voice_id
- Sentence-parallel TTS: speak() fires all sentences in parallel, plays in order
- speakGenRef generation counter prevents concurrent speak() calls from fighting
- V2: migrate to ElevenLabs Flash for character personality voices (500+ DAU milestone)

## ✅ Silent Mode (Focus Mode) — BUILT (Session 13)
Trader speaks freely while in a session — Buddy listens but never replies. No interruption to flow state.
- Toggle in BuddyChat: "Silent Mode" — mic stays active, speech-to-text still runs
- Every utterance goes through the full pipeline (Extractor → Context → Analyst → SaveDetector → Scribe) silently
- No Buddy response generated or displayed while mode is on
- When trader exits silent mode → Buddy surfaces a brief summary via surfaceSilentSummary()
- Tech: silentModeRef + silentLogRef in BuddyChat.tsx — pipeline runs unchanged, response gated on ref
- **Known issue**: Chrome Web Speech API is unreliable — stuck isSpeakingRef, user gesture chain requirements,
  recognition instance must be recreated on every onend restart. Voice input may not work reliably until
  OpenAI Whisper or Deepgram replaces Web Speech STT.


## ✅ Pipeline Latency Optimization — BUILT (Session 15)
Reduced text response from ~11s to ~0.5s TTFT. Voice first-audio from ~13s to ~2-3s.
- SSE streaming: /api/buddy → text/event-stream. Tokens flow as they generate.
- Streaming TTS: extractCompleteSentences() detects boundaries mid-stream, fires TTS per sentence.
  playStreamingSentences() plays ordered promise array that grows live — voice starts before reply finishes.
- Analyst fully decoupled: violations registered via .then(), never blocks response stream.
- ensureBank session flag: Hindsight bank-creation reduced from 2 calls/message → 1 call/session.
- max_tokens trimmed across all agents: Extractor 150, Analyst 300, SaveDetector 200, Scribe 300.
- Irreducible voice floor ~2-3s: Whisper STT (~900ms) + Buddy TTFT (~400ms) + TTS first sentence (~600ms).
  Root cause: Hindsight recallMemories is on critical path. Race condition fix (400ms window) deferred.

## ✅ Proactive Buddy — BUILT (Session 14)
Buddy initiates — speaks first without user prompting. The Jarvis moment.
- Phase 1 (live, free): session opener on BuddyChat mount → /api/buddy/proactive
- Phase 2 (built, needs Vercel Pro $20/mo): per-minute cron → /api/proactive-check → proactive_queue → Supabase Realtime push
- 9 modes: greet, reconnect, celebrate, check_in, intervene, debrief, milestone, quiet, banter
- ProactiveGate (inner thoughts) + ProactiveBuddy (message gen) — both Haiku
- Hard 30-min rate limit. Session-level skip guard (no double-greeting on refresh).
- proactive_queue + proactive_log tables: already created in Supabase
- CRON_SECRET env var needed in Vercel dashboard when upgrading to Pro


