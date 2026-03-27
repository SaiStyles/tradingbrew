# Ideas & Notes
> Dump ideas here so they don't get lost. No structure needed.

## Confession Mode
After a trade saves, Buddy asks: "Want to record how you felt in that moment?"
User hits a button, speaks freely — raw emotion, no structure needed.
- Voice saved as audio blob → Supabase Storage
- Optional transcription (Whisper)
- Buddy can reference the emotional pattern later without quoting it directly
- Prop firms love this for trader psychology insights
- Tech: MediaRecorder API (browser native, free)
- Playback in trade drawer alongside the trade details
 
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

## OpenAI TTS — Replace Web Speech Synthesis
Replace `window.speechSynthesis` with OpenAI TTS for a human-sounding Buddy voice.
- Web Speech is robotic and inconsistent across browsers — not acceptable for a product
- OpenAI tts-1, `onyx` or `nova` voice — natural, warm, consistent
- Cost: $15/1M chars. At 1000 DAU (~3.6M chars/mo) = ~$54/mo. Beta is basically free.
- No character voices — just one good human voice for now
- V2: migrate to ElevenLabs Flash when personality voices become a feature (500+ DAU)
- Architecture: new `/api/tts` route streams audio from OpenAI → browser plays via Web Audio API
- BuddyChat.tsx: replace `speak()` function only, mic/STT stays Web Speech (free, unchanged)
- Env var needed: `OPENAI_API_KEY` (package already installed)

## Silent Mode (Focus Mode)
Trader speaks freely while in a session — Buddy listens but never replies. No interruption to flow state.
- Toggle in BuddyChat: "Silent Mode" — mic stays active, speech-to-text still runs
- Every utterance goes through the full pipeline (Extractor → Context → Analyst → SaveDetector → Scribe) silently
- No Buddy response generated or displayed while mode is on
- When trader turns off mic / exits silent mode → Buddy surfaces a brief summary: what was logged, anything worth flagging, one line
- Use case: trader in the zone, doesn't want back-and-forth, just wants to narrate trades and have them captured
- Scribe still writes observations the whole time — memory builds even in silence
- Viral angle: "talk to a wall that actually listens" — traders who hate journaling will love this
- Tech: just gate the Buddy response in BuddyChat.tsx when silentMode = true. Pipeline unchanged.

## Proactive Buddy (Event-Driven)
Buddy initiates — doesn't wait for the trader to type first. "Speaks before you ask."
- Trigger events (priority order): market open → EOD debrief → high-impact news (CPI/NFP/FOMC) → inactivity pattern → X/Twitter alerts
- Architecture: SSE on BuddyChat (one-way push, simpler than WebSocket) + Vercel cron or Supabase pg_cron + Proactive Buddy agent
- Key primitive: reflect() — "Given what you know about this trader and that CPI drops in 20 minutes, what should Buddy say?" One call, fully personalized
- Proactive message drops into BuddyChat as a normal Buddy message — user replies naturally
- Existing reactive pipeline untouched — proactive is a separate layer on top
- news_events table already exists — news trigger is lowest-effort first win


