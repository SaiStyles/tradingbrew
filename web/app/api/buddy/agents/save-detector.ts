import Anthropic from '@anthropic-ai/sdk'
import type { ExtractedData, BuddyResponse, SaveDetectorParams } from '@/types/trade'
import { SaveDetectorOutputSchema } from '@/types/trade'
import { getISOOffset } from '../timezone'
import { parseWithSchema } from '@/lib/claude/parser'
import { withRetry } from '@/lib/claude/retry'

export async function runSaveDetector(params: SaveDetectorParams): Promise<BuddyResponse> {
  const { extracted, tradingDate, tradingTimezone } = params
  const fallback: BuddyResponse = { reply: '', save_trade: false, trade_data: null }

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return fallback

    const anthropic = new Anthropic({ apiKey })
    const offset = getISOOffset(tradingTimezone)

    // Recorder only — single-pass, save immediately if minimum fields present
    const system = `You are a trade save detector for a voice recorder.
A trader just spoke one utterance. The extracted fields are given below.

Save the trade if BOTH of these are present (not null):
- instrument (what was traded)
- pnl (the outcome — positive or negative number, including 0 for breakeven)

All other fields are optional — include them in trade_data if present:
- direction, opened_at, closed_at, position_size, emotion_tag, execution_score, followed_plan, rr, exit_reason, session

exit_reason exact values only: "Target hit", "Breakeven", "Stop out", "Manual exit", "Time stop", "Trailing stop", "News/event". null if not mentioned.
session: "london", "new_york", "asia", "overlap". Infer from time if not named. null if unclear.

If instrument AND pnl are both present → save_trade: true
If either is null → save_trade: false

Time format: ${tradingDate}T{time}:00${offset} — never append Z.
Use stated PnL always. Never calculate from prices.

Return ONLY valid JSON:
{"save_trade":false,"trade_data":null,"reply":""}
If save_trade true: {"save_trade":true,"trade_data":{"instrument":null,"direction":null,"pnl":null,"opened_at":null,"closed_at":null,"position_size":null,"emotion_tag":null,"execution_score":null,"rr":null,"exit_reason":null,"session":null,"followed_plan":null},"reply":""}`

    const userContent = `EXTRACTED FIELDS:\n${JSON.stringify(extracted)}\n\nReturn JSON.`

    const result = await withRetry(() => anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 260,
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
