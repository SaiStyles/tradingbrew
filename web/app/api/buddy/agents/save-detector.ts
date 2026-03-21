import Anthropic from '@anthropic-ai/sdk'
import type { ChatMessage, ExtractedData, BuddyResponse } from '@/types/trade'
import { getISOOffset } from '../timezone'

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

CONVERSATION:
${conversationStr}

BUDDY'S LATEST REPLY:
${buddyReply}

CURRENT EXTRACTION:
${JSON.stringify(extracted)}

TODAY: ${tradingDate}
TIMEZONE OFFSET: ${offset}

A trade is ready to save when the conversation contains ALL of these minimum fields:
- instrument (NQ, ES, EUR/USD etc)
- direction (long or short)
- pnl (stated by trader — never calculate)
- emotion (inferred from conversation)
- execution_score (1-10, stated by trader)

Optional but include if mentioned:
- opened_at (entry time)
- closed_at (exit time)
- entry_price
- exit_price
- stop_loss
- position_size
- followed_plan

Time format when building timestamps:
${tradingDate}T{stated_time}:00${offset}
Example: ${tradingDate}T09:30:00${offset}
Never append Z. Never convert timezone.
Use stated PnL always — never calculate from prices.

If trade is NOT ready return:
{"reply":"${buddyReply.replace(/"/g, '\\"')}","save_trade":false,"trade_data":null}

If trade IS ready return:
{"reply":"${buddyReply.replace(/"/g, '\\"')}","save_trade":true,"trade_data":{"instrument":null,"direction":null,"pnl":null,"opened_at":null,"closed_at":null,"entry_price":null,"exit_price":null,"stop_loss":null,"position_size":null,"emotion_tag":null,"execution_score":null,"followed_plan":null}}

Return ONLY valid JSON starting with {.`

    const result = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system,
      messages: [
        { role: 'user' as const, content: 'Analyze the conversation and return the JSON.' },
        { role: 'assistant' as const, content: '{' },
      ],
    })

    const raw = '{' + (result.content[0].type === 'text' ? result.content[0].text : '')
    const cleaned = raw.replace(/```json/g, '').replace(/```/g, '').trim()
    return JSON.parse(cleaned) as BuddyResponse
  } catch (e) {
    console.error('[save-detector] failed:', e)
    return fallback
  }
}
