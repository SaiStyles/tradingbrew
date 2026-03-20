import Anthropic from '@anthropic-ai/sdk'
import type { ExtractedData, ContextPacket, AnalystReport, TradeRecord } from '@/types/trade'

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

    const userContent = `You are a trading psychology analyst. Return ONLY valid JSON. No explanation.

Trade: ${JSON.stringify({ instrument: pending.instrument, direction: pending.direction, pnl: pending.pnl, emotion_tag: pending.emotion_tag })}
Last 3 trades: ${JSON.stringify(context.todaysTrades.slice(0, 3).map(t => ({ pnl: t.pnl, execution_score: t.execution_score, emotion_tag: t.emotion_tag })))}
Today: ${context.todaysTradeCount} trades, $${context.todaysPnL.toFixed(2)} PnL
Rules: ${JSON.stringify(context.activeRules.slice(0, 5))}
${context.propFirmAccount ? `Prop account: drawdown ${context.propFirmAccount.current_drawdown}/${context.propFirmAccount.max_drawdown}` : ''}
${context.memories.length > 0 ? `History:\n${context.memories.slice(0, 3).join('\n')}` : ''}

Detect: rule violations, revenge trading, overtrading, loss streak, execution decline, prop firm risk, positive patterns.
intervention_type: "revenge_trade"|"overleveraged"|"prop_firm_risk"|"loss_streak"|null
Return: {"violations":[],"warnings":[],"patterns":[],"positives":[],"intervention_needed":false,"intervention_type":null}`

    console.log('[analyst] input size:', userContent.length, 'chars | model: claude-haiku-4-5-20251001')
    console.log('[analyst] calling claude...')

    const result = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [
        { role: 'user', content: userContent },
        { role: 'assistant', content: '{' },
      ],
    })

    console.log('[analyst] claude responded')

    const raw = '{' + (result.content[0].type === 'text' ? result.content[0].text : '')
    const cleaned = raw.replace(/```json/g, '').replace(/```/g, '').trim()
    return JSON.parse(cleaned) as AnalystReport
  } catch (e) {
    console.error('[analyst] failed:', e)
    return { ...EMPTY }
  }
}
