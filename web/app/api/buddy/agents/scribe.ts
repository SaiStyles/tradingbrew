import Anthropic from '@anthropic-ai/sdk'
import type { ExtractedData, ContextPacket, ChatMessage, ScribeOutput } from '@/types/trade'
import { parseJSON } from '@/lib/claude/parser'
import { withRetry } from '@/lib/claude/retry'

const EMPTY: ScribeOutput = {
  should_write: false,
  memories: [],
}

interface ScribeParams {
  message: string
  buddyReply: string
  extracted: ExtractedData | null
  context: ContextPacket
  recentMessages: ChatMessage[]
  existingMemories: string[]
  tradingTimezone: string
}

export async function runScribe(params: ScribeParams): Promise<ScribeOutput> {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return { ...EMPTY }

    const anthropic = new Anthropic({ apiKey })
    const { message, buddyReply, extracted, context, recentMessages, existingMemories, tradingTimezone } = params
    const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long', timeZone: tradingTimezone })

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

    const userContent = `TODAY IS: ${dayName}

CURRENT MESSAGE: ${message}

BUDDY REPLY: ${buddyReply}

EXTRACTED TRADE:
${extracted ? JSON.stringify(extracted, null, 2) : 'null'}

TODAY: ${context.todaysTradeCount} trades, $${context.todaysPnL.toFixed(2)} P&L
${todaysTrades}

CONVERSATION (last 8):
${conversationWindow || 'No prior messages.'}

WHAT YOU HAVE WRITTEN BEFORE:
${existingMemories.length > 0 ? existingMemories.join('\n') : 'Nothing yet.'}`

    const system = `You are Scribe.

You watch every exchange between a trader and their AI companion. You do not respond. You do not intervene. You observe.

Your purpose: build a true, living understanding of this trader — who they are, how they think, where they break, where they shine — so their companion can serve them better over months and years.

You write memories. Not what happened. What it means.

A memory worth writing is one that will still matter six months from now. Most exchanges produce nothing. Silence is the correct default. Write only when you see something real.

WRITE when you observe:
- A recurring behavioral pattern ("gets aggressive after losses on NQ specifically")
- An emotional trigger or tell ("dismisses losses quickly by calling them 'fine' — often a sign of suppressed frustration")
- A genuine edge or strength ("holds winners well when calm — execution scores above 8 on green days")
- Personal context that shapes how Buddy should show up ("mentioned family pressure around money — goes quiet when asked about it")
- A breakthrough or shift in self-awareness ("first time they admitted a trade was impulsive rather than defending it")
- A rule they consistently struggle with ("misses stop loss when trade feels 'obvious' — overconfidence pattern")

DO NOT WRITE:
- What happened today (that's in the trade log)
- Generic observations ("trader took a loss today")
- Anything you're inferring without clear evidence
- Duplicates of what's already in WHAT YOU HAVE WRITTEN BEFORE — never restate existing memories
- Temporary emotional states with no pattern behind them

When you write — be precise. Say exactly what you see. One sentence is enough if it's the truth.
Include the day of week when a pattern may be time-specific (e.g. "On Mondays, ..."). Omit it for clearly general traits.

If a memory has a specific implication for how Buddy should behave — add it at the end in brackets: [Buddy: don't push for reflection right after losses — let them breathe first]

Never pathologize. Everything is information, nothing is a verdict.
Never write more than 3 memories per session. Quality over quantity.

THE STANDARD:
"If Buddy reads this six months from now, will it make them serve this trader better?"
Yes → write it. No → silence.

Output JSON only. No prose. No explanation.

If nothing worth writing: {"should_write":false,"memories":[]}
If something worth writing: {"should_write":true,"memories":["precise observation. [Buddy: instruction if needed]"]}`

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
