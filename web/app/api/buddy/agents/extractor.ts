import Anthropic from '@anthropic-ai/sdk'
import type { ExtractedData } from '@/types/trade'
import { getISOOffset, getTodayInTz } from '../timezone'
import { parseJSON } from '@/lib/claude/parser'
import { withRetry } from '@/lib/claude/retry'

const FAILED: ExtractedData = {
  instrument: null, direction: null, pnl: null,
  opened_at: null, closed_at: null,
  position_size: null,
  emotion: null, execution_score: null,
  followed_plan: null,
  confirmed: false, declined: false, has_trade: false,
  query_type: null, query_subtype: null,
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
      max_tokens: 500,
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
{"instrument":null,"direction":null,"pnl":null,"opened_at":null,"closed_at":null,"position_size":null,"emotion":null,"execution_score":null,"followed_plan":null,"confirmed":false,"declined":false,"has_trade":false,"query_type":null,"query_subtype":null}

Field rules:
- instrument: ticker symbol only (NQ, ES, AAPL, etc.)
- direction: "long" or "short" only, null if not mentioned
- pnl: number (positive or negative), null if not mentioned. If the trader explicitly states their PnL ('made $400', 'lost $200', 'up 400') — that is the PnL. Stated PnL always wins.
- emotion: one of: confident, hesitant, FOMO, revenge, bored, calm, frustrated, euphoric. Map similar words (nervous→hesitant, panicked→frustrated, greedy→FOMO).
- execution_score: 1-10 integer, null if not mentioned
- followed_plan: true when trader says anything like 'i did', 'yes', 'followed it', 'stuck to the plan', 'disciplined', 'as planned'. false when trader says 'deviated', 'went off plan', 'shouldn't have', 'revenge', 'impulsive'. Use judgment. null if not mentioned.
- confirmed: true if user is agreeing/confirming in any natural way
- declined: true if user is disagreeing, skipping, or saying no
- has_trade: true only if the message clearly describes a trade the user has already taken or is actively reporting — requires at minimum an instrument or a pnl or a direction. "I'm thinking about trading NQ" = false. "I took a NQ long" = true. "made $400 today" = true.
- query_type: "historical_analysis" if the user is asking a question about their past trading history, patterns, or performance (e.g. "how do I do on Mondays", "what's my win rate on NQ", "when did I last tilt", "how was last week"). null for everything else.
- query_subtype: when query_type is "historical_analysis" — "data" if they want stats/numbers only, "psychology" if they want emotional/behavioral patterns only, "both" if they want both or it's unclear. null when query_type is null.`,
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
