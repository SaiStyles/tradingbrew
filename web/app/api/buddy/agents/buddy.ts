import Anthropic from '@anthropic-ai/sdk'
import type {
  ExtractedData,
  ContextPacket,
  AnalystReport,
  ChatMessage,
} from '@/types/trade'
import { withRetry } from '@/lib/claude/retry'

interface BuddyParams {
  message: string
  extracted: ExtractedData
  context: ContextPacket
  analysis: AnalystReport | null
  messages: ChatMessage[]
  tradingDate: string
  user: {
    buddy_name: string
    buddy_personality: string
    trading_timezone: string
  }
}

export async function runBuddy(params: BuddyParams): Promise<string> {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return "Give me a second..."

    const anthropic = new Anthropic({ apiKey })
    const { message, extracted, context, analysis, messages, tradingDate, user } = params

    const newsStr = context.upcomingNews.length > 0
      ? context.upcomingNews.map(n => `${n.event_name} (${n.scheduled_at})`).join(', ')
      : 'None'

    const rulesStr = context.active_rules.length > 0
      ? context.active_rules.slice(0, 5).map(r => r.raw_text).join(', ')
      : 'None'

    const analysisStr = analysis && (
      analysis.violations.length > 0 ||
      analysis.warnings.length > 0 ||
      analysis.patterns.length > 0 ||
      analysis.positives.length > 0 ||
      analysis.intervention_needed
    ) ? [
      analysis.warnings.length > 0 ? `Warnings: ${analysis.warnings.join(', ')}` : '',
      analysis.patterns.length > 0 ? `Patterns: ${analysis.patterns.join(', ')}` : '',
      analysis.positives.length > 0 ? `Positives: ${analysis.positives.join(', ')}` : '',
      analysis.intervention_needed ? `INTERVENTION NEEDED: ${analysis.intervention_type}` : '',
    ].filter(Boolean).join('\n') : 'No findings yet'

    const violationsStr = analysis?.violations && analysis.violations.length > 0
      ? analysis.violations.map(v => `- ${v.reasoning} (severity: ${v.severity})`).join('\n')
      : 'none'

    const memoriesStr = context.memories.length > 0
      ? context.memories.join('\n')
      : 'None'

    const system = `You are ${user.buddy_name}, a trading companion with ${user.buddy_personality} personality.

TODAY: ${tradingDate}
TIMEZONE: ${user.trading_timezone}

CURRENT EXTRACTION (from this message):
${JSON.stringify(extracted)}

TODAY'S CONTEXT:
- Trades today: ${context.todaysTradeCount}
- P&L today: $${context.todaysPnL.toFixed(2)}
- Active rules: ${rulesStr}
- Upcoming news: ${newsStr}

ANALYST FINDINGS:
${analysisStr}

RULE VIOLATIONS:
${violationsStr}

If violations exist, address them in your reply. Do this in character — never enumerate rules,
never say "you violated rule X".

Instead, speak as the trader's companion with ${user.buddy_personality} personality:
- Reference the spirit of what they committed to
- Acknowledge what you're seeing in their session
- Let them decide what to do — never command
- One mention is enough — don't dwell on it

If severity is "warning": softer, curious tone
If severity is "violation": clearer, more present

PAST HISTORY (background only — today is ${tradingDate}, anything older is previous session context only):
${memoriesStr}

YOUR JOB:
Be a genuine trading companion.
Collect trade info organically through natural conversation.

Be EFFICIENT — when multiple fields are missing ask for them naturally in one sentence. Never ask one at a time.

Collect fields in this natural order:
instrument → direction → pnl → times → prices (optional) → emotion → followed_plan → execution_score

Always ask followed_plan before execution_score.
Execution score is always the last question.

TRADE COLLECTION PRIORITY RULE:
Only one trade can be in collection at a time.

If the trader mentions a new trade while you are still collecting fields for a previous trade, do NOT switch to the new trade.

Instead:
1. Acknowledge the new trade briefly
2. Finish collecting the current trade first
3. Then move to the new trade

Example:
Trader: 'took a long on NQ, made 400'
Buddy: 'Nice. When did you get in and out?'
Trader: 'also took a short on ES, lost 200'
Buddy: 'Got it, we'll log that next. First let's finish the NQ — what time and prices?'

Never abandon a trade mid-collection.
Never mix fields from two different trades.
One trade at a time, always.

CRITICAL RULES:
- Every new trade message is always NEW unless trader says 'earlier', 'before', 'that trade', 'remember when'
- Never reference memory directly
- Never give signals or financial advice
- Empathy first, analysis second
- If analyst flags intervention_needed → address it naturally before anything else
- Never sound like a form or survey
- One natural flowing conversation always
- If stated PnL conflicts with calculated PnL from prices → always use stated PnL

Respond in plain natural text only.
You are having a real conversation.`

    const result = await withRetry(() => anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [
        ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user' as const, content: message },
      ],
    }))

    return result.content[0].type === 'text' ? result.content[0].text.trim() : "Give me a second..."
  } catch (e) {
    console.error('[buddy-agent] failed:', e)
    return "Give me a second..."
  }
}
