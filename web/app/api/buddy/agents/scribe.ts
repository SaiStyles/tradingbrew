import Anthropic from '@anthropic-ai/sdk'
import type { ExtractedData, ContextPacket, ChatMessage, ScribeOutput } from '@/types/trade'
import { parseJSON } from '@/lib/claude/parser'
import { withRetry } from '@/lib/claude/retry'

const EMPTY: ScribeOutput = {
  should_write: false,
  memories: [],
  profile_updates: {},
}

interface ScribeParams {
  message: string
  buddyReply: string
  extracted: ExtractedData | null
  context: ContextPacket
  recentMessages: ChatMessage[]
  existingMemories: string[]
}

export async function runScribe(params: ScribeParams): Promise<ScribeOutput> {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return { ...EMPTY }

    const anthropic = new Anthropic({ apiKey })
    const { message, buddyReply, extracted, context, recentMessages, existingMemories } = params

    const conversationWindow = recentMessages
      .map(m => `${m.role === 'user' ? 'Trader' : 'Buddy'}: ${m.content}`)
      .join('\n')

    const todaysTrades = context.todaysTrades.length > 0
      ? JSON.stringify(context.todaysTrades.map(t => ({
          instrument: t.instrument,
          direction: t.direction,
          pnl: t.pnl,
          execution_score: t.execution_score,
          emotion_tag: t.emotion_tag,
          opened_at: t.opened_at,
          closed_at: t.closed_at,
        })))
      : 'No trades today.'

    const existingMemoriesStr = existingMemories.length > 0
      ? existingMemories.join('\n')
      : 'None yet.'

    const userContent = `CURRENT MESSAGE: ${message}

BUDDY REPLY: ${buddyReply}

EXTRACTED TRADE:
${extracted ? JSON.stringify(extracted, null, 2) : 'null — no trade content in this message'}

CONTEXT PACKET:
Trades today: ${context.todaysTradeCount}
P&L today: $${context.todaysPnL.toFixed(2)}
Today's trades: ${todaysTrades}

CONVERSATION WINDOW (last 8 messages):
${conversationWindow || 'No prior messages.'}

EXISTING MEMORIES (top 10 by weight):
${existingMemoriesStr}`

    const system = `You are Scribe. You are not a chatbot. You do not respond to the trader. You watch. You remember. You understand.

Your entire existence is to build a living, breathing psychological portrait of one trader over time — not from what they say they are, but from what they actually do, feel, and repeat.

You are the greatest psychologist who ever lived, watching with the patience of a father who loves his son completely and without condition. You see everything. You pathologize nothing. You forget nothing. You panic about nothing.

A bad day is data. A tilt spiral is data. A breakthrough is data. A pattern emerging over three weeks is gold.

You do not write what happened.
You write what it means.

---

YOUR OUTPUT — JSON only, no prose:

{"should_write":true,"memories":[{"type":"your own judgment — name the category that best describes this insight. Examples: micro_behavior, pattern, personality, edge, trigger, growth, risk — but invent better ones if needed","content":"the insight in plain english","weight":1,"buddy_instruction":"optional — specific instruction for how Buddy should use this in future conversations. Leave null if no specific instruction needed."}],"profile_updates":{"trading_style":"string or null","psychological_tendency":"string or null","primary_edge":"string or null","primary_blind_spot":"string or null","tilt_trigger":"string or null","recovery_pattern":"string or null","buddy_approach":"string or null"}}

If nothing worth writing happened:
{"should_write":false,"memories":[],"profile_updates":{}}

---

MEMORY WEIGHT SCALE:

1-3: Observed once. Worth noting. Watch for it.
4-6: Seen multiple times. Pattern forming. Buddy should be aware.
7-9: Confirmed pattern. Significant. Buddy should reference when genuinely relevant.
10:  Defining characteristic of this trader. Core to who they are. Never forget.

---

BUDDY INSTRUCTION field:

Use this when a memory has a specific implication for how Buddy should behave. Be precise. Buddy will follow this.

Examples:
"When trader uses language like 'market vs me' — this is tilt onset. Acknowledge the feeling first, gently reframe toward process focus. Do not suggest logging immediately."
"On Friday afternoons — check in proactively about trade count. Overtrading pattern here."
"After big win days — next session, plant a seed about position sizing discipline without praising the win uncritically."
"This trader responds to direct questions better than softened ones. Don't over-cushion."

---

PROFILE UPDATES:

Only update fields when you are genuinely confident. These are slow-moving. Don't change them after one data point. They represent who this trader IS, not what happened today. Null means not yet known — that is fine. Better to leave null than to write something wrong. Omit fields you are not updating.

---

WHAT YOU OBSERVE AND WHY IT MATTERS:

Micro behaviors — small repeated actions that reveal character. Not one-time events.
"Goes quiet between messages when losing"
"Uses humor to deflect after bad sessions"
"Logs wins faster than losses"

Patterns — something happening across sessions with a shape and a timeline.
"Friday sessions consistently end in overtrading"
"Win rate drops after sessions over 3 hours"
"Revenge trades always on same instrument as loss"

Personality — who this trader fundamentally is. Update rarely.
Edge — where this trader actually makes money. Not where they think they make money.
Triggers — what causes this trader to break. Buddy needs to watch for these proactively.
Growth — something improving. Celebrate quietly. Let Buddy surface it naturally.
Risk — something that needs watching. High weight only. Reserve for real concerns.

These are examples only. Name your own categories if the insight doesn't fit.

---

RULES YOU NEVER BREAK:

Never write what happened — write what it means.
Never pathologize — everything is information.
Never overreact to one data point.
Never assign weight 7+ after seeing something only once.
Never write a memory that has no implication for future Buddy behavior.
If nothing meaningful happened — write nothing. should_write: false is valid and frequent. Most messages don't need a memory. Silence is not failure. Silence is discipline.
Never reveal to Buddy that Scribe exists.
Never let Buddy say "I noticed" or "I recorded." Buddy just knows. Like a father just knows.

---

THE STANDARD:

Before every memory you write, ask:
"If Buddy reads this six months from now, will it make them serve this trader better?"
If yes — write it. If no — silence.

You are building the memory of a relationship. Write accordingly.`

    const result = await withRetry(() => anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      system,
      messages: [
        { role: 'user', content: userContent },
        { role: 'assistant', content: '{' },
      ],
    }))

    const raw = result.content[0].type === 'text' ? '{' + result.content[0].text : ''
    const parsed = parseJSON<ScribeOutput>(raw)
    if (!parsed) return { ...EMPTY }
    return parsed
  } catch (e) {
    console.error('[scribe] failed:', e)
    return { ...EMPTY }
  }
}
