import Anthropic from '@anthropic-ai/sdk'
import type { ChatMessage, ExtractedData, BuddyResponse, SaveDetectorParams } from '@/types/trade'
import { SaveDetectorOutputSchema } from '@/types/trade'
import { getISOOffset } from '../timezone'
import { parseWithSchema } from '@/lib/claude/parser'
import { withRetry } from '@/lib/claude/retry'

export async function runSaveDetector(params: SaveDetectorParams): Promise<BuddyResponse> {
  const { messages, extracted, tradingDate, tradingTimezone, mode = 'explorer' } = params
  const fallback: BuddyResponse = { reply: '', save_trade: false, trade_data: null }

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return fallback

    const anthropic = new Anthropic({ apiKey })
    const offset = getISOOffset(tradingTimezone)

    // Recorder: single-pass — one utterance, save immediately if minimum fields present
    // Explorer: conversation-aware — fields may be spread across multiple turns
    const isRecorder = mode === 'recorder'

    const system = isRecorder
      ? `You are a trade save detector for a voice recorder.
A trader just spoke one utterance. The extracted fields are given below.
Save the trade immediately if ALL minimum fields are present (not null):
- instrument, direction, pnl, opened_at, emotion_tag

Optional fields — include if present: execution_score, closed_at, position_size, followed_plan, rr

If minimum fields present → save_trade: true
If any minimum field is null → save_trade: false

Time format: ${tradingDate}T{time}:00${offset} — never append Z.
Use stated PnL always. Never calculate from prices.

Return ONLY valid JSON:
{"save_trade":false,"trade_data":null,"reply":""}
If save_trade true: {"save_trade":true,"trade_data":{"instrument":null,"direction":null,"pnl":null,"opened_at":null,"closed_at":null,"position_size":null,"emotion_tag":null,"execution_score":null,"rr":null,"followed_plan":null},"reply":""}`
      : `You are a trade data extractor.
Read the FULL conversation and determine if a complete trade is ready to be saved.

IMPORTANT: Trade fields may be spread across multiple conversation turns. Read every message.
The CURRENT EXTRACTION at the bottom reflects only the LAST message — ignore its has_trade field.
Make your save_trade decision based solely on whether the full conversation contains the required fields.

A trade is ready when the conversation contains ALL of these fields:
- instrument (NQ, ES, EUR/USD etc)
- direction (long or short)
- pnl (dollar amount trader made or lost — "lost 800" means pnl = -800)
- opened_at (any entry time mention — "entered at 9:30", "9:30am", "at the open")
- emotion_tag (how trader felt — "frustrated", "calm", "FOMO" etc)

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

    const conversationStr = messages
      .map(m => `${m.role === 'user' ? 'Trader' : 'Buddy'}: ${m.content}`)
      .join('\n')

    const userContent = isRecorder
      ? `EXTRACTED FIELDS:\n${JSON.stringify(extracted)}\n\nReturn JSON.`
      : `CONVERSATION:\n${conversationStr}\n\nNOTE: CURRENT EXTRACTION below is from the LAST message only — fields may have been collected across multiple turns in the conversation above.\nCURRENT EXTRACTION:\n${JSON.stringify(extracted)}\n\nRead the FULL conversation to find all trade fields. Return JSON.`

    const result = await withRetry(() => anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [
        { role: 'user' as const, content: userContent },
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
