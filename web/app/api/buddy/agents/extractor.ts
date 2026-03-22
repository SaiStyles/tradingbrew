import Anthropic from '@anthropic-ai/sdk'
import type { ExtractedData, ChatMessage } from '@/types/trade'
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
  save_trade: false, has_trade_data: false, trade_data: null,
}

export async function runExtractor(
  message: string,
  tradingTimezone: string,
  messages?: ChatMessage[]
): Promise<ExtractedData> {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return { ...FAILED }

    const anthropic = new Anthropic({ apiKey })
    const today = getTodayInTz(tradingTimezone)
    const offset = getISOOffset(tradingTimezone)

    const historyStr = messages && messages.length > 0
      ? '\n\nCONVERSATION HISTORY (use for save detection and completing trade_data):\n' +
        messages.slice(-10).map(m => `${m.role === 'user' ? 'Trader' : 'Buddy'}: ${m.content}`).join('\n')
      : ''

    const result = await withRetry(() => anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 700,
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
{"instrument":null,"direction":null,"pnl":null,"opened_at":null,"closed_at":null,"entry_price":null,"exit_price":null,"stop_loss":null,"position_size":null,"emotion":null,"execution_score":null,"followed_plan":null,"confirmed":false,"declined":false,"has_trade":false,"save_trade":false,"has_trade_data":false,"trade_data":null}

Field rules (current message extraction):
- instrument: ticker symbol only (NQ, ES, AAPL, etc.)
- direction: "long" or "short" only, null if not mentioned
- pnl: number (positive or negative), null if not mentioned. If the trader explicitly states their PnL ('made $400', 'lost $200', 'up 400') — that is the PnL. Never calculate or override it from entry/exit prices. Stated PnL always wins. Only calculate PnL if trader never mentioned it at all.
- emotion: one of: confident, hesitant, FOMO, revenge, bored, calm, frustrated, euphoric
- execution_score: 1-10 integer, null if not mentioned
- followed_plan: true when trader says anything like 'i did', 'yes', 'followed it', 'stuck to the plan', 'disciplined', 'as planned'. false when trader says 'deviated', 'went off plan', 'shouldn't have', 'revenge', 'impulsive'. Use judgment — don't require exact phrases. null if not mentioned.
- confirmed: true if user is agreeing/confirming in any natural way
- declined: true if user is disagreeing, skipping, or saying no
- has_trade: true if message describes a completed or in-progress trade

SAVE DETECTION (uses current message + conversation history):
- has_trade_data: true if ANY trade fields are present in current message or conversation history
- save_trade: true ONLY when ALL of these are present across current message + conversation history: instrument, direction, pnl, opened_at, emotion, execution_score. false otherwise.
- trade_data: when save_trade is true, output the complete trade data collected from the full conversation. Use emotion_tag (not emotion) in trade_data. Set to null when save_trade is false.

DUPLICATE RULE: If conversation history contains a message starting with "[SYSTEM: Trade already saved" for this instrument + pnl — set save_trade to false.${historyStr}`,
      messages: [
        { role: 'user', content: message },
        { role: 'assistant', content: '{' },
      ],
    }))

    const raw = result.content[0].type === 'text' ? result.content[0].text : ''
    const parsed = parseJSON<ExtractedData>(raw)
    if (!parsed) return { ...FAILED }
    return parsed
  } catch (e) {
    console.log('[extractor] failed:', e)
    return { ...FAILED }
  }
}
