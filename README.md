# TradingBrew

> **~90% done. Core is built. Contributions welcome.**

**Just speak. We handle the rest.**

An open-source AI trading recorder that listens while you trade, logs your trades automatically, and delivers psychological insights at the end of your session — no typing, no commands, no friction.

---

## The Idea

Traders don't want to talk to AI. They want to talk to limbo — and have limbo quietly handle everything.

You mumble your trades while watching charts. TradingBrew listens, extracts structured data from your natural speech, saves your trades, detects behavioral patterns, and sends you a Telegram summary when you're done.

The Analyst tab is for exploration — ask anything about your trading history in plain English and get real answers backed by your actual data.

I built this alone. It's about 90% there. But I'm stepping away and won't be actively developing it anymore. If the idea resonates with you, pick it up — it won't take much to get it across the line.

---

## What's Built

### Recorder (Core UX)
- Vintage tape reel animation — pulses when speech is detected
- Silero VAD (ML-based) — accurate speech detection, no amplitude hacks
- OpenAI Whisper STT — transcribes on silence
- Passive pipeline — speak naturally, trades save in the background
- Multi-message accumulation — "took a trade" → "NQ" → "lost 1641" → one complete saved trade
- Multi-trade capture — "NQ made 5000, ES lost 2000" → two trades, one sentence
- End Session → Telegram summary

### AI Pipeline (7 Agents)
| Agent | Type | Role |
|---|---|---|
| Extractor | Claude Haiku | Field extraction + query detection from raw speech |
| Context | Pure TS | Fetches trades, rules, account, news from Supabase |
| QueryAnalyst | Claude Haiku | Natural language → SQL for historical questions |
| Analyst | Claude Haiku | Pattern detection, rule violations, behavioral flags |
| Buddy | Claude Haiku | Conversation, empathy, historical storytelling |
| SaveDetector | Pure TS | Null check — instrument + PnL present → save |
| Scribe | Claude Haiku | Psychological memory builder, fires post-response |

### Analyst Tab
- Text-only chat
- Ask anything: "How do I trade Mondays?", "What's my win rate on NQ?", "When did I last revenge trade?"
- Real SQL against your data, Buddy tells the story

### Journal
- Day-grouped with per-day AI note
- Trade detail, screenshots, voice note per trade

### Performance Stats (`/stats`)
- 12 KPIs, equity curve, drawdown, trade distribution
- By instrument / day of week / hour of day
- Psychology section: emotion vs PnL, plan adherence, execution score
- 13-week calendar heatmap

### Other Working Pieces
- Buddy personality system — type any character, Claude adapts fully
- Rules manager — write rules in plain English, AI enforces them
- Goals page — weekly goals with progress rings
- Economic calendar (TradingView embed)
- Telegram end-of-session delivery
- Trading timezone support

---

## What's Not Done (and Needs to Be)

This is where someone could take it from working prototype to real product. Listed roughly in order of impact:

**High value, not built:**
- [ ] **Journal search/filter** — by instrument, emotion, date range, win/loss. Schema is there, UI isn't.
- [ ] **Multi-trade reliability** — the drain loop that captures "NQ made 5k, ES lost 2k" in one sentence has a 5s timeout. Under Haiku load it can still miss the second trade. Needs a more robust queuing approach.
- [ ] **ElevenLabs character voices** — this is the viral hook. Buddy personality works in text. Add matching voice from ElevenLabs community library and you have screenshot moments. See `CLAUDE.md` for the design.
- [ ] **Desktop app (Tauri)** — lightweight always-on-top companion. Same web frontend, Tauri wraps it. ~5MB. The codebase is set up for it; just hasn't been built.
- [ ] **Billing (Stripe)** — Free tier (30 trades) / Pro ($19/mo). Schema has no billing tables yet. Would need user-level rate limiting too.

**Medium value:**
- [ ] **Discord integration** — same pattern as Telegram (webhook + session summary). Would take a day.
- [ ] **Multi-account UI** — the `accounts` table already supports multiple accounts per user. Dashboard and journal don't surface it yet.
- [ ] **Telegram morning briefing** — the route is built (`/api/telegram/briefing`). Requires Vercel Pro for the cron scheduler. Would need a self-hosted alternative for the open source version.
- [ ] **Voice latency** — currently ~2.5s floor (Whisper + context fetch + first token). Can be reduced by pre-fetching DB context on speech start before Whisper finishes. Details in `BUGS.md`.

**Known rough edges:**
- Hindsight semantic memory (vectorize.io) credits 402 silently — Buddy just runs without memories. No user-facing error.
- 1 flaky test in the suite (QueryAnalyst DOW SQL — Haiku non-determinism, not a code bug)
- Voice recorder does not work on mobile (intentional for now)

---

## Tech Stack

- **Frontend**: Next.js 15, TypeScript, TailwindCSS, Framer Motion, Recharts
- **Database**: Supabase (PostgreSQL + Storage + Auth)
- **AI**: Anthropic Claude Haiku (5 agents), OpenAI Whisper (STT)
- **Voice**: Silero VAD WASM (`@ricky0123/vad-web`) + OpenAI Whisper
- **Memory**: Hindsight gen2 (vectorize.io) — optional, but strongly recommended for the full experience
- **Messaging**: Telegram Bot API
- **Deployment**: Vercel (or any Node.js host)

---

## Getting Started

### Prerequisites

- Node.js 18+
- [Supabase](https://supabase.com) project
- [Anthropic](https://console.anthropic.com) API key
- [OpenAI](https://platform.openai.com) API key (Whisper STT)

### Setup

```bash
git clone https://github.com/SaiStyles/tradingbrew.git
cd tradingbrew/web
npm install
cp .env.example .env.local
# fill in .env.local with your keys
```

### Database

Run these in your Supabase SQL editor:

```
docs/setup-db-functions.sql     # required — analytics RPC function
docs/add-telegram.sql           # optional — Telegram integration
docs/add-screenshots.sql        # optional — screenshot storage
docs/add-daily-portraits.sql    # optional — portrait cache
```

### Run

```bash
npm run dev
```

### Notes

- COOP/COEP headers are required for Silero VAD (SharedArrayBuffer). They're already set in `next.config.ts`.
- Run tests with `npx vitest run --no-file-parallelism` (sequential to stay under Anthropic 50 RPM rate limit).

---

## Architecture

**Read `CLAUDE.md` before touching agents.** It's the full product and architecture bible — agent design, pipeline decisions, prompt philosophy, what's been tried and why.

Short version:
- AI owns all judgment calls. Code owns all data operations.
- Never hardcode trading behavior. Everything behavioral lives in agent prompts.
- Recorder is not a chatbot. It has no reply. You speak, trades save silently.

```
tradingbrew/
├── web/
│   ├── app/api/buddy/          # 7-agent pipeline (agents/ subfolder)
│   ├── lib/claude/             # Shared parser, retry, Anthropic singleton
│   ├── lib/supabase/           # Client, server, run-analytics (SQL executor)
│   ├── lib/memory/             # Hindsight integration
│   ├── components/buddy/       # BuddyChat — Recorder + Analyst tabs
│   └── types/trade.ts          # All interfaces + Zod schemas
└── docs/                       # SQL migrations
```

---

## Contributing

PRs welcome. If you're building one of the missing pieces above, open an issue first so we know what's being worked on.

---

## License

MIT
