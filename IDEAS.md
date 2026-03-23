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

## Chart Screenshots (Autonomous, Nightly)
When a trade is saved, generate a chart screenshot after market close.
- Data: `yahoo-finance2` (free, covers ES=F, NQ=F, MES=F, MNQ=F) → swap to Databento if it breaks
- Render: TradingView Lightweight Charts (client) or QuickChart.io (server)
- Trigger: Vercel cron at 11pm, batch all trades with no screenshot_url
- Store: Supabase Storage → trades.screenshot_url
- Long term: Tauri desktop app screenshots the actual TradingView window at trade close moment

