import Anthropic from '@anthropic-ai/sdk'
import type { ChatMessage, ExtractedData, BuddyResponse } from '@/types/trade'
import { getISOOffset } from '../timezone'
import { parseJSON } from '@/lib/claude/parser'
import { withRetry } from '@/lib/claude/retry'

interface SaveDetectorParams {
  messages: ChatMessage[]
  buddyReply: string
  extracted: ExtractedData
  tradingDate: string
  tradingTimezone: string
}

export async function runSaveDetector(params: SaveDetectorParams): Promise<BuddyResponse> {
  const { messages, buddyReply, extracted, tradingDate, tradingTimezone } = params
  const fallback: BuddyResponse = { reply: buddyReply, save_trade: false, trade_data: null }

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return fallback

    const anthropic = new Anthropic({ apiKey })
    const offset = getISOOffset(tradingTimezone)

    const conversationStr = messages
      .map(m => `${m.role === 'user' ? 'Trader' : 'Buddy'}: ${m.content}`)
      .join('\n')

    const system = `You are a trade data extractor.
Read the conversation and determine if a complete trade is ready to be saved.

A trade is ready when the conversation contains ALL of these fields:
- instrument (NQ, ES, EUR/USD etc)
- direction (long or short)
- pnl (dollar amount trader made or lost)
- opened_at (entry time)
- emotion_tag (how trader felt)
- execution_score (number 1-10)

These fields are optional but include if mentioned:
- closed_at (exit time)
- entry_price
- exit_price
- stop_loss
- position_size
- followed_plan

MULTIPLE TRADES RULE:
If the conversation contains multiple trades, save only the most recently discussed trade — the one Buddy is currently collecting fields for. Ignore earlier trades that already have a [SYSTEM: Trade already saved] marker in the conversation history. Never mix fields from two different trades.

DUPLICATE RULE — ONLY exception to saving:
If conversation contains a message starting with [SYSTEM: Trade already saved] that matches this trade's instrument + pnl → return save_trade: false

For everything else:
If minimum fields present → save_trade: true
If minimum fields NOT present → save_trade: false

You are not a judge. You are not a detector.
You just check if the fields exist.
That is your entire job.

Time format when building timestamps:
${tradingDate}T{time}:00${offset}
Example: ${tradingDate}T09:30:00${offset}
Never append Z.

Use stated PnL always.
Never calculate PnL from prices.

Return ONLY valid JSON:
{"save_trade":false,"trade_data":null,"reply":""}

If save_trade is true:
{"save_trade":true,"trade_data":{"instrument":null,"direction":null,"pnl":null,"opened_at":null,"closed_at":null,"entry_price":null,"exit_price":null,"stop_loss":null,"position_size":null,"emotion_tag":null,"execution_score":null,"followed_plan":null},"reply":""}

reply is always empty string.
trade_data is null when save_trade is false.`

    const result = await withRetry(() => anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [
        {
          role: 'user' as const,
          content: `CONVERSATION:\n${conversationStr}\n\nCURRENT EXTRACTION:\n${JSON.stringify(extracted)}\n\nAnalyze and return the JSON.`,
        },
        { role: 'assistant' as const, content: '{' },
      ],
    }))

    const raw = result.content[0].type === 'text' ? '{' + result.content[0].text : ''
    const parsed = parseJSON<BuddyResponse>(raw)
    if (!parsed) return fallback
    return { ...parsed, reply: buddyReply }
  } catch (e) {
    console.error('[save-detector] failed:', e)
    return fallback
  }
}
