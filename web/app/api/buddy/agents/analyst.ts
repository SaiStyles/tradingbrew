import Anthropic from '@anthropic-ai/sdk'
import type { ExtractedData, ContextPacket, AnalystReport, TradeRecord } from '@/types/trade'
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
  pending: Partial<TradeRecord>
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
    const propFirmAccount = context.propFirmAccount
      ? `Drawdown: ${context.propFirmAccount.current_drawdown}/${context.propFirmAccount.max_drawdown}`
      : 'No prop firm account.'
    const memories = context.memories.length > 0
      ? context.memories.join('\n')
      : 'No historical patterns.'

    const userContent = `You are a trading psychologist and performance analyst. You have access to:

CURRENT TRADE (being collected, may be incomplete):
instrument: ${extracted?.instrument ?? 'not yet provided'}
direction: ${extracted?.direction ?? 'not yet provided'}
pnl: ${extracted?.pnl ?? 'not yet provided'}
opened_at: ${extracted?.opened_at ?? 'not yet provided'}
closed_at: ${extracted?.closed_at ?? 'not yet provided'}
entry_price: ${extracted?.entry_price ?? 'not yet provided'}
exit_price: ${extracted?.exit_price ?? 'not yet provided'}
emotion_tag: ${extracted?.emotion ?? 'not yet provided'}
execution_score: ${extracted?.execution_score ?? 'not yet provided'}
followed_plan: ${extracted?.followed_plan ?? 'not yet provided'}

Reason about what is known. Do not flag missing fields as violations or warnings — they are simply not collected yet. Focus on what the available data tells you about patterns, rule adherence, and trader state.

TODAY'S SESSION:
${todaysTrades}

ACTIVE TRADER RULES:
${activeRules}

For each rule above, reason about whether the current trade data, session behavior, or emotional
state suggests this rule is being broken or is at risk of being broken.

Rules are personal commitments, not formulas. Interpret them with judgment:
- "after 2 losses" means consider the loss streak
- "when frustrated" means consider emotion field
- "first 2 hours" means consider trade timestamps
- Ambiguous rules → err on the side of surfacing

PROP FIRM ACCOUNT:
${propFirmAccount}

HISTORICAL PATTERNS FROM MEMORY:
${memories}

Look at everything above holistically.
Think like a psychologist, not an accountant.

What patterns do you see?
What concerns you about this trader right now?
What's going well that deserves acknowledgment?
Is any immediate intervention needed?

Trust your judgment completely.
You are not checking boxes.
You are reading a human being.

Return ONLY valid JSON with these exact fields:
{"violations":[{"rule_id":"<id from rules above>","severity":"warning","reasoning":"One sentence. What specifically triggered this."}],"warnings":[],"patterns":[],"positives":[],"intervention_needed":false,"intervention_type":null}

violations: array of rule violations (use rule_id from ACTIVE TRADER RULES above). Empty array if none.
severity: "warning" if at risk, "violation" if clearly broken.
reasoning: write as if explaining to a coach, not a system. Never say "rule violated".
warnings: general behavioral/psychological concerns not tied to a specific rule.
intervention_type: string describing the intervention type, or null if none needed`

    console.log('[analyst] extracted received:', JSON.stringify(extracted))
    console.log('[analyst] userContent preview:', userContent.substring(0, 500))
    console.log('[analyst] input size:', userContent.length, 'chars | model: claude-haiku-4-5-20251001')
    console.log('[analyst] calling claude...')

    const result = await withRetry(() => anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
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
