import Anthropic from '@anthropic-ai/sdk'
import type { ExtractedData, ContextPacket, AnalystReport, TradeRecord } from '@/types/trade'
import { parseJSON } from '@/lib/claude/parser'

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
    const activeRules = context.activeRules.length > 0
      ? context.activeRules.slice(0, 5).map(r => r.description ?? r.name).join('\n')
      : 'No active rules.'
    const propFirmAccount = context.propFirmAccount
      ? `Drawdown: ${context.propFirmAccount.current_drawdown}/${context.propFirmAccount.max_drawdown}`
      : 'No prop firm account.'
    const memories = context.memories.length > 0
      ? context.memories.join('\n')
      : 'No historical patterns.'

    const userContent = `You are a trading psychologist and performance analyst. You have access to:

TODAY'S SESSION:
${todaysTrades}

ACTIVE RULES:
${activeRules}

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

Return ONLY valid JSON:
{"violations":[],"warnings":[],"patterns":[],"positives":[],"intervention_needed":false,"intervention_type":null}
intervention_type: string describing the intervention type, or null if none needed`

    console.log('[analyst] input size:', userContent.length, 'chars | model: claude-haiku-4-5-20251001')
    console.log('[analyst] calling claude...')

    const result = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      messages: [
        { role: 'user', content: userContent },
        { role: 'assistant', content: '{' },
      ],
    })

    console.log('[analyst] claude responded')

    const raw = result.content[0].type === 'text' ? result.content[0].text : ''
    const parsed = parseJSON<AnalystReport>(raw)
    if (!parsed) return { ...EMPTY }
    return parsed
  } catch (e) {
    console.error('[analyst] failed:', e)
    return { ...EMPTY }
  }
}
