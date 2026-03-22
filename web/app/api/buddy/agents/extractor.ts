import Anthropic from '@anthropic-ai/sdk'
import type { ExtractedData } from '@/types/trade'
import { getISOOffset, getTodayInTz } from '../timezone'
import { parseJSON } from '@/lib/claude/parser'
import { withRetry } from '@/lib/claude/retry'

const FAILED: ExtractedData = {
  instrument: null, direction: null, pnl: null,
  opened_at: null, closed_at: null,
  entry_price: null, exit_price: null,
  stop_loss: null, position_size: null,
  emotion: null, execution_score: null,
  followed_plan: null,
  confirmed: false, declined: false, has_trade: false,
}

export async function runExtractor(
  message: string,
  tradingTimezone: string
): Promise<ExtractedData> {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return { ...FAILED }

    const anthropic = new Anthropic({ apiKey })
    const today = getTodayInTz(tradingTimezone)
    const offset = getISOOffset(tradingTimezone)

    const result = await withRetry(() => anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: `You are a data extractor for a trading journal.
Extract trading information from the user message.
Return ONLY valid JSON. No explanation. No conversation. Just the JSON object.

Today's date: ${today} (trader's timezone: ${tradingTimezone})
Trader's UTC offset: ${offset}

When extracting times:
- Format: YYYY-MM-DDTHH:MM:00${offset}
- Example: ${today}T09:30:00${offset}
- Never append Z. Never convert timezone.
- Use today's date combined with the stated time.
- If AM/PM not stated, infer from context (9:30 = 09:30 AM for US markets).

Return this exact JSON structure:
{"instrument":null,"direction":null,"pnl":null,"opened_at":null,"closed_at":null,"entry_price":null,"exit_price":null,"stop_loss":null,"position_size":null,"emotion":null,"execution_score":null,"followed_plan":null,"confirmed":false,"declined":false,"has_trade":false}

Field rules:
- instrument: ticker symbol only (NQ, ES, AAPL, etc.)
- direction: "long" or "short" only, null if not mentioned
- pnl: number (positive or negative), null if not mentioned. If the trader explicitly states their PnL ('made $400', 'lost $200', 'up 400') — that is the PnL. Never calculate or override it from entry/exit prices. Stated PnL always wins. Only calculate PnL if trader never mentioned it at all.
- emotion: one of: confident, hesitant, FOMO, revenge, bored, calm, frustrated, euphoric
- execution_score: 1-10 integer, null if not mentioned
- followed_plan: true when trader says anything like 'i did', 'yes', 'followed it', 'stuck to the plan', 'disciplined', 'as planned'. false when trader says 'deviated', 'went off plan', 'shouldn't have', 'revenge', 'impulsive'. Use judgment — don't require exact phrases. null if not mentioned.
- confirmed: true if user is agreeing/confirming in any natural way
- declined: true if user is disagreeing, skipping, or saying no
- has_trade: true if message contains ANY trade-related content: an instrument name (NQ, ES, MNQ, forex pair, stock ticker), a direction (long, short, buy, sell, bought, sold, longed, shorted), a P&L mention (made X, lost X, up X, down X, +X, -X), an entry or exit price, or trade times. Does NOT require all fields — even one trade field = true.`,
      messages: [
        { role: 'user', content: message },
        { role: 'assistant', content: '{' },
      ],
    }))

    const raw = result.content[0].type === 'text' ? '{' + result.content[0].text : ''
    const parsed = parseJSON<ExtractedData>(raw)
    if (!parsed) return { ...FAILED }
    return parsed
  } catch (e) {
    console.log('[extractor] failed:', e)
    return { ...FAILED }
  }
}
