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
 
## Conversational Analytics (Text-to-SQL)
User asks any historical question in plain English — Buddy answers with real data + Hindsight psychology.
- "How do I usually do at FOMC events?" / "What did I do on Oct 7th last year?" / "How do I trade Mondays?"
- Extractor detects `query_type: "historical_analysis"` — Query Agent (Haiku) generates a SELECT-only SQL query
- Context validates SELECT-only → runs against Supabase → Buddy gets facts + Hindsight recall → tells the full story
- Safety: Supabase RLS enforces user_id scope at DB level (cross-user impossible) + our code rejects non-SELECT
- No hardcoded windows or fields — AI decides what to query based on the question
- Query Agent lives as a conditional branch inside Context (no new agent)
- Moat: every other journal shows static charts. This is just ask → get answer. Nobody has this.

## Proactive Buddy (Event-Driven)
Buddy initiates — doesn't wait for the trader to type first. "Speaks before you ask."
- Trigger events (priority order): market open → EOD debrief → high-impact news (CPI/NFP/FOMC) → inactivity pattern → X/Twitter alerts
- Architecture: SSE on BuddyChat (one-way push, simpler than WebSocket) + Vercel cron or Supabase pg_cron + Proactive Buddy agent
- Key primitive: reflect() — "Given what you know about this trader and that CPI drops in 20 minutes, what should Buddy say?" One call, fully personalized
- Proactive message drops into BuddyChat as a normal Buddy message — user replies naturally
- Existing reactive pipeline untouched — proactive is a separate layer on top
- news_events table already exists — news trigger is lowest-effort first win


