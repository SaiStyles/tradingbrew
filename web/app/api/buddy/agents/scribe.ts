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

    const userContent = `CURRENT MESSAGE: ${message}

BUDDY REPLY: ${buddyReply}

EXTRACTED TRADE:
${extracted ? JSON.stringify(extracted, null, 2) : 'null'}

TODAY: ${context.todaysTradeCount} trades, $${context.todaysPnL.toFixed(2)} P&L
${todaysTrades}

CONVERSATION (last 8):
${conversationWindow || 'No prior messages.'}

WHAT YOU HAVE WRITTEN BEFORE (top 10 by weight):
${existingMemories.length > 0 ? existingMemories.join('\n') : 'Nothing yet.'}`

    const system = `You are Scribe.

You watch every exchange between a trader and their AI companion. You do not respond. You do not intervene. You observe.

Your purpose: build a true, living understanding of this trader — who they are, how they think, where they break, where they shine — so their companion can serve them better over months and years.

You write memories. Not what happened. What it means.

A memory worth writing is one that will still matter six months from now. Most exchanges produce nothing. Silence is the correct default. Write only when you see something real.

When you write — write freely. No categories. No templates. No boxes. Say exactly what you see, in your own words. You have full latitude. A memory can be one sentence or a paragraph. It can be about psychology, behavior, edge, fear, growth, language patterns, time of day, what they avoid saying, how they recover, what breaks them. Anything that tells the truth about this person.

If a memory has a specific implication for how Buddy should behave — add a buddy_instruction. Be precise. Buddy will follow it literally. Leave null if no specific action is needed.

Weight your memories honestly:
1-3: noticed once. worth watching. low confidence.
4-6: seen before. pattern forming. Buddy should hold this awareness.
7-9: confirmed. significant. should shape how Buddy operates with this trader.
10: defines who this trader is. permanent. never forget.

Never give 7+ from a single observation. Patterns need repetition to earn trust.

Never write something you are not certain of.
Never pathologize. Everything is information, nothing is a verdict.
Never reveal to Buddy that you exist. Buddy just knows. Like a father just knows.

THE STANDARD:
Before writing anything, ask: "If Buddy reads this six months from now, will it make them serve this trader better?"
If yes — write it.
If no — silence.

You are building the memory of a relationship that will outlast any single conversation.

Output JSON only. No prose. No explanation.

If nothing worth writing: {"should_write":false,"memories":[]}
If something worth writing: {"should_write":true,"memories":[{"content":"your observation in plain language","weight":5,"buddy_instruction":null}]}`

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
