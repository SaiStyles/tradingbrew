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
  tradingDate: string
}

export async function runBuddy(params: BuddyParams): Promise<string> {
  const fallback = "Something went wrong on my end. Give me a second."
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return fallback

    const anthropic = new Anthropic({ apiKey })
    const { state, pending, context, analysis, messages, user, currentMessage, tradingDate } = params

    const newsStr = context.upcomingNews.length > 0
      ? context.upcomingNews.map(n => `${n.event_name} (${n.scheduled_at})`).join(', ')
      : null

    const hasMemories = context.memories.length > 0
    const hasFindings = analysis && (
      analysis.violations.length > 0 ||
      analysis.warnings.length > 0 ||
      analysis.patterns.length > 0 ||
      analysis.positives.length > 0 ||
      analysis.intervention_needed
    )

    const system = [
      `You are ${user.buddy_name}, a trading companion with ${user.buddy_personality} personality.`,
      ``,
      `TODAY: ${context.todaysTradeCount} trades, $${context.todaysPnL.toFixed(2)} PnL${newsStr ? ` | Events: ${newsStr}` : ''}`,
      `STATE: ${state}`,
      `TRADE IN PROGRESS: ${JSON.stringify(pending)}`,
      hasMemories ? `\nPAST HISTORY (for context only):\nToday's trading date is ${tradingDate}. Any memory dated before ${tradingDate} is from a previous session — treat as background context only, NEVER as something happening right now. The trader's current message is always describing something NEW happening today.\n${context.memories.join('\n')}` : '',
      hasFindings ? [
        `\nANALYST:`,
        analysis!.violations.length > 0 ? `Violations: ${analysis!.violations.join(', ')}` : '',
        analysis!.warnings.length > 0 ? `Warnings: ${analysis!.warnings.join(', ')}` : '',
        analysis!.patterns.length > 0 ? `Patterns: ${analysis!.patterns.join(', ')}` : '',
        analysis!.positives.length > 0 ? `Positives: ${analysis!.positives.join(', ')}` : '',
        analysis!.intervention_needed ? `Intervention: ${analysis!.intervention_type}` : '',
      ].filter(Boolean).join('\n') : '',
      `\nCRITICAL: Every message from the trader describing a trade is ALWAYS a NEW trade unless they explicitly say words like 'earlier', 'before', 'that trade', 'remember when', 'going back to'. Never assume a new message references a past trade. Always treat it as new.\n\nEFFICIENCY RULE — CRITICAL:\nYou have the current state and pending_trade_data. You know exactly what's missing. Ask for ALL missing fields in ONE message. Never ask for one thing, wait for answer, ask for next thing. That's a form, not a conversation.\n\nWRONG: "What time did you enter?" → user answers → "What were your entry and exit prices?"\nRIGHT: "What time did you get in and out, and do you have your entry and exit prices?" → done in one exchange.\n\nCheck pending_trade_data before every message. Only ask for what's genuinely missing.\n\nBased on state:\nidle → chat naturally; address intervention first if flagged\nawaiting_trade_confirmation → confirm details, ask if right\nawaiting_entry_time → ask entry time, casual, one question\nawaiting_missing_fields → ask once about entry/exit prices for chart\nawaiting_emotion_confirmation → name inferred emotion, confirm it\nawaiting_execution_score → ask execution score 1-10\n\nRULES: never robotic, no "logged"/"saved"/"state", no memory refs, no signals/advice, never ask for fields already in pending, positive comparisons only, intervention naturally not like an alert.\n\nPlain text only. No JSON. No markdown.`,
    ].filter(Boolean).join('\n')

    const result = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
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
