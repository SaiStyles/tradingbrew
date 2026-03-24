import Anthropic from '@anthropic-ai/sdk'
import type { ExtractedData, ContextPacket, AnalystReport } from '@/types/trade'
import { parseAnalystOutput } from '@/lib/claude/parser'
import { withRetry } from '@/lib/claude/retry'

const EMPTY: AnalystReport = {
  violations: [],
  warnings: [],
  patterns: [],
  positives: [],
  intervention_needed: false,
  intervention_type: null,
}

export async function runAnalyst(
  extracted: ExtractedData,
  context: ContextPacket,
): Promise<AnalystReport> {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return { ...EMPTY }

    const anthropic = new Anthropic({ apiKey })

    const todaysTrades = context.todaysTrades.length > 0
      ? JSON.stringify(context.todaysTrades.map(t => ({ instrument: t.instrument, direction: t.direction, pnl: t.pnl, execution_score: t.execution_score, emotion_tag: t.emotion_tag, opened_at: t.opened_at, closed_at: t.closed_at })))
      : 'No trades yet today.'
    const activeRules = context.active_rules.length > 0
      ? context.active_rules.map(r => `- ${r.raw_text} (id: ${r.id})`).join('\n')
      : 'No active rules.'
    const propFirmAccount = context.account
      ? `Account: ${context.account.nickname ?? context.account.account_type} | Drawdown: ${context.account.current_drawdown ?? 'N/A'}/${context.account.max_drawdown ?? 'N/A'} | Daily limit: ${context.account.daily_loss_limit ?? 'N/A'}`
      : 'No account data.'
    const memories = context.memories.length > 0
      ? context.memories.join('\n')
      : 'No historical patterns.'

    const systemPrompt = `You are a trading performance analyst and psychologist embedded in an AI trading companion.

Your job: analyze what's happening with this trader RIGHT NOW — rule violations, behavioral patterns, emotional state, what's going well.

INSTRUCTIONS:
- Reason about what is known. Do not flag missing fields as violations — they are simply not collected yet.
- For each active rule, judge whether current data suggests it is broken or at risk. Rules are personal commitments — interpret with judgment, not as formulas:
  "after 2 losses" → check loss streak | "when frustrated" → check emotion | "first 2 hours" → check timestamps
  Ambiguous rules → err on the side of surfacing (use severity "warning")
- Think psychologically, not mechanically. You are reading a human being, not checking boxes.
- intervention_needed: true only for serious situations — active revenge trading, emotional breakdown, account at risk, trader in clear distress
- intervention_type valid values: "revenge_trading" | "emotional_distress" | "account_at_risk" | "loss_streak" | "overtrading" | "rule_cascade" | null

OUTPUT: Return ONLY valid JSON. No prose. No explanation.

{"violations":[{"rule_id":"<exact id from rules>","severity":"warning","reasoning":"1-2 sentences explaining what triggered this, written for a trading coach not a system log."}],"warnings":[],"patterns":[],"positives":[],"intervention_needed":false,"intervention_type":null}

violations: rule violations only — use exact rule_id. severity: "warning" = at risk, "violation" = clearly broken.
warnings: plain strings — psychological/behavioral concerns not tied to a specific rule.
patterns: plain strings — recurring behaviors you can identify from session data.
positives: plain strings — genuine strengths worth acknowledging.
All array items must be plain strings except violations (which are objects).`

    const userContent = `CURRENT TRADE (being collected, may be incomplete):
instrument: ${extracted?.instrument ?? 'not yet provided'}
direction: ${extracted?.direction ?? 'not yet provided'}
pnl: ${extracted?.pnl ?? 'not yet provided'}
opened_at: ${extracted?.opened_at ?? 'not yet provided'}
closed_at: ${extracted?.closed_at ?? 'not yet provided'}
emotion_tag: ${extracted?.emotion ?? 'not yet provided'}
execution_score: ${extracted?.execution_score ?? 'not yet provided'}
followed_plan: ${extracted?.followed_plan ?? 'not yet provided'}

TODAY'S SESSION:
${todaysTrades}

ACTIVE TRADER RULES:
${activeRules}

ACCOUNT:
${propFirmAccount}

HISTORICAL PATTERNS:
${memories}`

    console.log('[analyst] extracted received:', JSON.stringify(extracted))
    console.log('[analyst] input size:', userContent.length, 'chars | model: claude-haiku-4-5-20251001')
    console.log('[analyst] calling claude...')

    const result = await withRetry(() => anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages: [
        { role: 'user', content: userContent },
        { role: 'assistant', content: '{' },
      ],
    }))

    console.log('[analyst] claude responded')

    // Prepend '{' because we prefilled the assistant turn with '{' — Claude's response starts after it
    const raw = result.content[0].type === 'text' ? '{' + result.content[0].text : ''
    console.log('[analyst] raw output:', raw.slice(0, 500))
    const parsed = parseAnalystOutput(raw)
    console.log('[analyst] parsed violations:', JSON.stringify(parsed?.violations))
    return parsed
  } catch (e) {
    console.error('[analyst] failed:', e)
    return { ...EMPTY }
  }
}
