# TradingBrew

**Just speak. We handle the rest.**

An open-source AI trading recorder that listens while you trade, logs your trades automatically, and delivers psychological insights at the end of your session — all without you lifting a finger or typing a single word.

---

## What Is This?

TradingBrew is built on a single observation: **traders don't want to talk to AI. They want to talk to limbo — and have limbo quietly handle everything.**

You mumble your trades while watching charts. TradingBrew listens, extracts structured data from your natural speech, saves your trades, detects behavioral patterns, and sends you a Telegram summary when you're done. No commands. No chat. No friction.

The Analyst tab exists for exploration — ask anything about your trading history in plain English and get real answers backed by your actual data.

---

## Live Features

### Recorder (Core UX)
- Vintage tape reel animation — pulses when speech is detected
- Silero VAD (ML-based, not amplitude) — accurate speech detection
- OpenAI Whisper STT — transcribes voice segments on silence
- Passive pipeline: speak naturally, trades save in the background
- Multi-message accumulation — "I took a trade" → "it was NQ" → "lost 1641" → one complete trade saved
- Multi-trade capture — "NQ made 5000, ES lost 2000" → two trades, one sentence
- End Session → Telegram summary delivered instantly

### AI Pipeline (7 Agents)
| Agent | Type | Role |
|---|---|---|
| Extractor | Claude Haiku | Field extraction + query detection from raw speech |
| Context | Pure TS | Fetches trades, rules, account, news from Supabase |
| QueryAnalyst | Claude Haiku | Natural language → SQL for historical questions |
| Analyst | Claude Haiku | Pattern detection, rule violations, behavioral flags |
| Buddy | Claude Haiku | Conversation, empathy, historical storytelling |
| SaveDetector | Pure TS | Null check — instrument + PnL present → save trade |
| Scribe | Claude Haiku | Psychological memory builder, fires post-response |

### Analyst Tab
- Text-only chat (no voice output)
- Ask anything: "How do I trade Mondays?", "What's my win rate on NQ?", "When did I last revenge trade?"
- Conversational analytics — real SQL against your data, Buddy tells the story
- Psychology recall — "How have I been lately?" pulls Scribe observations, not just numbers

### Journal
- Day-grouped layout with per-day AI note
- Trade detail: instrument, direction, PnL, session, setup type, exit reason, mistakes
- Trade screenshots (drag/drop, lightbox, keyboard nav)
- Voice note per trade (record in browser, plays inline)
- Load more pagination

### Performance Stats (`/stats`)
- 12 KPI cards: PnL, Win Rate, Profit Factor, Expectancy, Sharpe, Max Drawdown, Recovery Factor, Consistency Score, Streak
- Equity curve + drawdown overlay
- Daily PnL bars, trade distribution histogram
- By instrument / day of week / hour of day
- Rolling profit factor (edge decay detection)
- Psychology section: emotion vs PnL, plan adherence, execution score
- 13-week calendar heatmap
- Filter: 7D | MTD | 30D | 3M | All

### Other
- Buddy personality system — choose any character (Friendly Mentor, Drill Sergeant, Zen Master, Gordon Gekko, or type anything)
- Trading rules manager — write rules in plain English, AI enforces them automatically
- Goals page — weekly goals with progress rings, 4 types (Performance / Psychology / Process / Risk)
- Economic calendar — TradingView embed with country filters
- Telegram integration — connect in Settings, receive session summaries
- Trading timezone support throughout
- Session-aware psychology (Scribe anchors every observation to day of week)

---

## What Is NOT Built Yet

Be honest with yourself before diving in — this is a working prototype, not a polished product.

**Missing / Incomplete:**
- Journal search and filter (by instrument, emotion, date range, win/loss)
- Desktop app (Tauri) — planned as a lightweight always-on-top companion
- Mobile — lowest priority, maybe never
- ElevenLabs character voices — the viral hook (personality in text works, voice doesn't)
- Discord integration — same pattern as Telegram, post-launch if demand
- Stripe billing / Pro tier — app is free-only right now
- Telegram morning briefing cron — built but requires Vercel Pro plan
- Hindsight memory credits — the semantic recall layer requires a paid vectorize.io account; app works without it (Buddy just runs without trader portrait)
- Multi-account support — schema supports it, UI doesn't surface it yet

**Known rough edges:**
- Multi-trade drain loop timeout is 5s — under high Haiku load it can still miss a second trade
- Voice latency floor is ~2.5s (Whisper + context fetch + first token) — irreducible with current stack
- Hindsight credits 402-ing silently — Buddy doesn't tell you; check vectorize.io dashboard
- Test suite has 1 flaky test (QueryAnalyst DOW SQL — Haiku non-determinism, not a bug in our code)

---

## Tech Stack

- **Frontend**: Next.js 15, TypeScript, TailwindCSS, Framer Motion, Recharts
- **Backend**: Next.js API routes (Edge-compatible)
- **Database**: Supabase (PostgreSQL + Storage + Auth)
- **AI**: Anthropic Claude Haiku (5 agents), OpenAI Whisper (STT)
- **Voice**: Silero VAD WASM (`@ricky0123/vad-web`) + OpenAI Whisper
- **Memory**: Hindsight gen2 (vectorize.io) — optional semantic layer
- **Messaging**: Telegram Bot API
- **Deployment**: Vercel

---

## Getting Started

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project
- An [Anthropic](https://console.anthropic.com) API key
- An [OpenAI](https://platform.openai.com) API key (for Whisper STT)

### Setup

```bash
git clone https://github.com/SaiStyles/tradingbrew.git
cd tradingbrew/web
npm install
```

Copy the environment template and fill in your values:

```bash
cp .env.example .env.local
```

See `.env.example` for all required and optional variables.

### Database

Run these SQL files in your Supabase SQL editor in order:

```
docs/setup-db-functions.sql        # Core RPC functions (required)
docs/add-telegram.sql              # Telegram integration (optional)
docs/add-screenshots.sql           # Trade screenshot storage (optional)
docs/add-daily-portraits.sql       # Daily trader portrait cache (optional)
```

> The analytics query function (`setup-db-functions.sql`) is required for the Analyst tab to work.

### Run

```bash
npm run dev
```

Open `http://localhost:3000`.

### Vercel (COOP/COEP required for VAD)

The `web/vercel.json` already sets the required cross-origin isolation headers for Silero VAD. No extra config needed on Vercel.

---

## Project Structure

```
tradingbrew/
├── web/
│   ├── app/
│   │   ├── (auth)/          # Login + register
│   │   ├── (dashboard)/     # Dashboard, journal, stats, goals, news
│   │   ├── onboarding/
│   │   └── api/
│   │       ├── buddy/       # Main AI pipeline + 7 agents
│   │       ├── trades/      # Trade CRUD
│   │       ├── rules/       # Rules CRUD + violations
│   │       ├── telegram/    # Bot webhook + summary
│   │       └── stt/         # Whisper transcription
│   ├── components/
│   │   ├── buddy/           # BuddyChat (Recorder + Analyst tabs)
│   │   └── journal/         # Journal, trade drawer, screenshots
│   ├── lib/
│   │   ├── claude/          # Shared parser, retry, Anthropic client singleton
│   │   ├── supabase/        # Client, server, run-analytics
│   │   └── memory/          # Hindsight integration
│   ├── hooks/               # useWhisperSTT, useTrades, etc.
│   └── types/               # trade.ts — all interfaces + Zod schemas
└── docs/                    # SQL migration files
```

---

## Philosophy

**AI owns all judgment calls. Our code owns all data operations.**

The pipeline makes zero hardcoded trading decisions. No hardcoded rules about when to revenge trade, what a good execution score is, or what patterns matter. Everything behavioral goes through an agent prompt. The code is pure infrastructure.

**Recorder is not a chatbot.** The Recorder tab has no reply. No voice output. No conversation. You speak, the system listens, trades save silently. That's the whole product.

---

## Contributing

This project is open source. PRs welcome.

If you're picking something up:
- Check the known rough edges above before reporting bugs
- The test suite runs with `npx vitest run --no-file-parallelism` (sequential required to stay under Anthropic's 50 RPM rate limit)
- `CLAUDE.md` has the full architecture bible — read it before touching agents

---

## License

MIT
