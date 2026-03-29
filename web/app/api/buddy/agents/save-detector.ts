import Anthropic from '@anthropic-ai/sdk'
import type { ChatMessage, ExtractedData, BuddyResponse, SaveDetectorParams } from '@/types/trade'
import { SaveDetectorOutputSchema } from '@/types/trade'
import { getISOOffset } from '../timezone'
import { parseWithSchema } from '@/lib/claude/parser'
import { withRetry } from '@/lib/claude/retry'

export async function runSaveDetector(params: SaveDetectorParams): Promise<BuddyResponse> {
  const { messages, extracted, tradingDate, tradingTimezone } = params
  const fallback: BuddyResponse = { reply: '', save_trade: false, trade_data: null }

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

These fields are optional but include if mentioned:
- execution_score (number 1-10)
- closed_at (exit time)
- position_size
- followed_plan
- rr (risk/reward — any mention of R-multiple or ratio anywhere in the conversation. "1:2", "2R", "it was a 3R setup", "risked 1 to make 2" — all count. Capture exactly as stated.)

MULTIPLE TRADES RULE:
If the conversation contains multiple trades, save only the most recently discussed trade — the one Buddy is currently collecting fields for. The current trade is the first trade AFTER the most recent [SYSTEM: Trade already saved] marker. Never mix fields from two different trades.

DUPLICATE RULE — ONLY exception to saving:
If conversation contains [SYSTEM: Trade already saved] that matches this trade on ALL of: instrument + direction + pnl + opened_at → return save_trade: false.
If any of those fields differ, it is a different trade and SHOULD be saved.
Two identical-looking trades at different times are not duplicates.

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
{"save_trade":true,"trade_data":{"instrument":null,"direction":null,"pnl":null,"opened_at":null,"closed_at":null,"position_size":null,"emotion_tag":null,"execution_score":null,"rr":null,"followed_plan":null},"reply":""}

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
    const parsed = parseWithSchema(raw, SaveDetectorOutputSchema)
    if (!parsed) return fallback
    // Strip null values from trade_data — TradeRecord fields are string/number, not nullable
    const trade_data = parsed.trade_data
      ? Object.fromEntries(
          Object.entries(parsed.trade_data).filter(([, v]) => v !== null)
        ) as Partial<import('@/types/trade').TradeRecord>
      : null
    return { ...parsed, trade_data, reply: '' }
  } catch (e) {
    console.error('[save-detector] failed:', e)
    return fallback
  }
}
