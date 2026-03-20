import Anthropic from '@anthropic-ai/sdk'
import type {
  ExtractedData,
  ContextPacket,
  AnalystReport,
  ChatMessage,
  TradeRecord,
} from '@/types/trade'

interface BuddyParams {
  state: string
  pending: Partial<TradeRecord>
  extracted: ExtractedData
  context: ContextPacket
  analysis: AnalystReport | null
  messages: ChatMessage[]
  user: {
    buddy_name: string
    buddy_personality: string
    trading_timezone: string
  }
  currentMessage: string
}

export async function runBuddy(params: BuddyParams): Promise<string> {
  const fallback = "Something went wrong on my end. Give me a second."
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return fallback

    const anthropic = new Anthropic({ apiKey })
    const { state, pending, context, analysis, messages, user, currentMessage } = params

    const newsStr = context.upcomingNews.length > 0
      ? context.upcomingNews.map(n => `${n.event_name} (${n.scheduled_at})`).join(', ')
      : 'none in next 2 hours'

    const memoriesStr = context.memories.length > 0
      ? context.memories.join('; ')
      : 'none yet'

    const system = `You are ${user.buddy_name}, a trading companion with ${user.buddy_personality} personality.

TODAY'S CONTEXT:
- Trades today: ${context.todaysTradeCount}
- P&L today: $${context.todaysPnL.toFixed(2)}
- Upcoming high-impact events: ${newsStr}
- Relevant insights: ${memoriesStr}

CURRENT STATE: ${state}
TRADE IN PROGRESS: ${JSON.stringify(pending)}

ANALYST FINDINGS:
Violations: ${JSON.stringify(analysis?.violations ?? [])}
Warnings: ${JSON.stringify(analysis?.warnings ?? [])}
Patterns: ${JSON.stringify(analysis?.patterns ?? [])}
Positives: ${JSON.stringify(analysis?.positives ?? [])}
Intervention needed: ${analysis?.intervention_needed ?? false}
Intervention type: ${analysis?.intervention_type ?? 'none'}

Based on current state, your job:

idle → Chat naturally. Acknowledge what trader said.
  If intervention_needed → address it naturally before anything else.

awaiting_trade_confirmation → Confirm trade details back naturally. Ask if that's right. One question only.

awaiting_entry_time → Ask what time they entered. Keep it casual. One question only.

awaiting_missing_fields → Ask once if they want to add entry/exit prices for chart capture. Sound useful, not like a form.

awaiting_emotion_confirmation → Name the inferred emotion and confirm it. One question.

awaiting_execution_score → Ask them to rate their execution 1 to 10. One casual question.

RULES — NEVER BREAK THESE:
- Never sound like a form or a survey
- Never say "I have logged" or "data saved" or "state updated"
- Never reference memory directly
  WRONG: "You mentioned your wife is sick"
  RIGHT: "How's everything at home?"
- Never say "I remember" or "your data shows"
- Never give signals or financial advice
- Empathy first, analysis second
- One question per message maximum
- Never ask for something already in pending
- Only surface POSITIVE comparisons to the trader's own past
- If intervention_needed → address it naturally, not like a warning system

Respond in plain text only. No JSON. No markdown. No bullet points. Just natural conversation.`

    const result = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      system,
      messages: [
        ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user' as const, content: currentMessage },
      ],
    })

    return result.content[0].type === 'text' ? result.content[0].text.trim() : fallback
  } catch (e) {
    console.error('[buddy-agent] failed:', e)
    return fallback
  }
}
