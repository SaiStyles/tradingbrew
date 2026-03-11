# 04 — Tech Stack

## Frontend
| Technology | Purpose | Why |
|---|---|---|
| Next.js | Web app | React based, fast, SEO friendly |
| TailwindCSS | Styling | Fast, consistent, utility first |
| Framer Motion | Animations | Smooth, professional feel |

## Backend
| Technology | Purpose | Why |
|---|---|---|
| Node.js + Express | API server | Familiar, fast, great ecosystem |
| PostgreSQL | Main database | Structured trade data, reliable |
| Redis | Caching + real time | Fast session data, pub/sub |
| WebSockets | Live connection | Real time buddy communication |

## AI Layer
| Technology | Purpose | Why |
|---|---|---|
| Claude Sonnet | Core conversation | Best for nuanced buddy dialogue |
| Claude Haiku | Simple tasks | Cheap, fast for confirmations |
| Web Speech API | Voice input (V1) | Free, browser native |
| Web Speech Synthesis | Voice output (V1) | Free, browser native |
| Whisper (V2) | Voice input | Production quality STT |
| ElevenLabs (V2) | Voice output | Human quality TTS |

## Memory
| Technology | Purpose | Why |
|---|---|---|
| Mem0 | AI memory layer | Purpose built for LLM memory |
| PGVector | Vector storage | Semantic search in PostgreSQL |

## Infrastructure
| Technology | Purpose | Why |
|---|---|---|
| Supabase | DB + Auth + Storage | All in one, generous free tier |
| Vercel | Web deployment | Zero config, Next.js native |
| Railway | Backend deployment | Simple, affordable |
| AWS S3 | Screenshot storage | Cheap, reliable, scalable |

## Notifications
| Technology | Purpose | Why |
|---|---|---|
| Firebase | Push notifications | Free tier, reliable |

## External APIs
| API | Purpose |
|---|---|
| Econoday / Trading Economics | Economic calendar |
| X/Twitter API | Trader content feed |
| TradingView (Chrome Extension) | Screenshot automation |

## Desktop
| Technology | Purpose | Why |
|---|---|---|
| Electron | Windows app wrapper | Same codebase as web, zero rewrite |

---

## Model Routing Strategy
```
90% interactions → Claude Haiku
  (trade confirmations, simple alerts, 
   news formatting, quick responses)

9% interactions → Claude Sonnet
  (deep conversation, pattern detection,
   reflection questions, weekly summaries)

1% interactions → Reserved for future
  (monthly deep analysis if needed)
```

## Cost Per User Per Month
```
Claude API:    ~$1.50
Web Speech:    $0.00 (V1 free)
Mem0:          ~$0.20
Supabase:      ~$0.10
Total:         ~$1.80/user/month
Revenue:       $24/user/month (V2)
Margin:        92%
```

---

## V1 vs V2 Technology
```
V1 (Build now):
- Web Speech API (free voice)
- Claude Sonnet + Haiku
- Supabase free tier
- Vercel free tier

V2 (After revenue):
- ElevenLabs (human voice)
- Whisper (accurate STT)
- Upgrade infrastructure tiers
```
