import Anthropic from '@anthropic-ai/sdk'
import type { ExtractedData } from '@/types/trade'
import { ExtractedDataSchema } from '@/types/trade'
import { getISOOffset, getTodayInTz } from '../timezone'
import { parseWithSchema } from '@/lib/claude/parser'
import { withRetry } from '@/lib/claude/retry'

const FAILED: ExtractedData = {
  instrument: null, direction: null, pnl: null,
  opened_at: null, closed_at: null,
  position_size: null,
  emotion: null, execution_score: null,
  followed_plan: null, market_condition: null,
  confirmed: false, declined: false, has_trade: false,
  query_type: null, query_subtype: null,
}

export async function runExtractor(
  message: string,
  tradingTimezone: string,
  mode: 'recorder' | 'explorer' = 'explorer'
): Promise<ExtractedData> {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return { ...FAILED }

    const anthropic = new Anthropic({ apiKey })
    const today = getTodayInTz(tradingTimezone)
    const offset = getISOOffset(tradingTimezone)

    // Recorder: lean prompt — field extraction only, no query detection
    // Explorer: full prompt — field extraction + query_type/subtype for analytics routing
    const systemPrompt = mode === 'recorder'
      ? `You are a trade data extractor for a voice trading recorder.
Extract fields from a single voice utterance. Return ONLY valid JSON.

Today: ${today} | UTC offset: ${offset}
Time format: ${today}T09:30:00${offset} — never append Z.
If AM/PM not stated, assume AM for US market hours (9:30 = 09:30).

Return this exact structure:
{"instrument":null,"direction":null,"pnl":null,"opened_at":null,"closed_at":null,"position_size":null,"emotion":null,"execution_score":null,"followed_plan":null,"market_condition":null,"confirmed":false,"declined":false,"has_trade":false,"query_type":null,"query_subtype":null}

Rules:
- instrument: ticker only (NQ, ES, AAPL)
- direction: "long" or "short" only
- pnl: number. Stated PnL wins. "made $400"=400, "lost $200"=-200.
- emotion: confident/hesitant/FOMO/revenge/bored/calm/frustrated/euphoric
- execution_score: 1-10 integer
- followed_plan: true="followed it/disciplined/as planned", false="revenge/impulsive/shouldn't have", null=not mentioned
- has_trade: true if describes a completed trade (needs instrument OR pnl OR direction). "thinking about NQ"=false. "took NQ long"=true.
- market_condition: trending/choppy/news-driven/range if described, else null
- confirmed/declined/query_type/query_subtype: always false/false/null/null`
      : `You are a data extractor for a trading journal.
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
{"instrument":null,"direction":null,"pnl":null,"opened_at":null,"closed_at":null,"position_size":null,"emotion":null,"execution_score":null,"followed_plan":null,"market_condition":null,"confirmed":false,"declined":false,"has_trade":false,"query_type":null,"query_subtype":null}

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
- query_type: "historical_analysis" if the user (1) asks any question about past trading history, patterns, or performance ("how do I do on Mondays", "what's my win rate on NQ", "when did I last tilt", "how was last week"), OR (2) makes an implicit observation about a pattern that could be validated with data ("I feel worse on Mondays", "I've been revenge trading a lot lately", "NQ always kills me", "been struggling this week", "I keep losing on Fridays", "my mornings are terrible"), OR (3) expresses concern about a recurring issue without asking a direct question. null for everything else — reporting a new trade, casual chat, market commentary, single-event statements.
- query_subtype: when query_type is "historical_analysis" — "data" if they explicitly want stats/numbers only, "psychology" ONLY for open-ended pattern questions with no date reference and no specific instrument/day/period (e.g. "what's my biggest weakness", "am I a revenge trader"). If the question or observation references a specific date/day/period/instrument OR combines psychology with a time anchor → "both". null when query_type is null. When in doubt: "both".
- market_condition: infer silently from how the trader describes the price action. "trending" when they describe a clean directional move, breakout, momentum. "choppy" when they describe whipsaw, noise, getting stopped out both ways, no clean move. "news-driven" when they mention a specific event (CPI, FOMC, NFP, earnings) driving the move. "range" when they describe price bouncing between levels, consolidation, range-bound. null if no price action description in the message.`

    const result = await withRetry(() => anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      system: systemPrompt,
      messages: [
        { role: 'user', content: message },
        { role: 'assistant', content: '{' },
      ],
    }))

    const raw = result.content[0].type === 'text' ? '{' + result.content[0].text : ''
    const parsed = parseWithSchema(raw, ExtractedDataSchema)
    if (!parsed) return { ...FAILED }
    return parsed
  } catch (e) {
    console.log('[extractor] failed:', e)
    return { ...FAILED }
  }
}
