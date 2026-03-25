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

## Proactive Buddy (Event-Driven)
Buddy initiates — doesn't wait for the trader to type first. "Speaks before you ask."
- Trigger events (priority order): market open → EOD debrief → high-impact news (CPI/NFP/FOMC) → inactivity pattern → X/Twitter alerts
- Architecture: SSE on BuddyChat (one-way push, simpler than WebSocket) + Vercel cron or Supabase pg_cron + Proactive Buddy agent
- Key primitive: reflect() — "Given what you know about this trader and that CPI drops in 20 minutes, what should Buddy say?" One call, fully personalized
- Proactive message drops into BuddyChat as a normal Buddy message — user replies naturally
- Existing reactive pipeline untouched — proactive is a separate layer on top
- news_events table already exists — news trigger is lowest-effort first win


