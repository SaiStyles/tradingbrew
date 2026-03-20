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

    const result = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: `You are a trading psychology analyst.
Analyze the current trade and session data.
Identify patterns, rule violations, and warnings.
Return ONLY valid JSON. No explanation. No conversation.

Current trade being logged: ${JSON.stringify(pending)}
Today's trades (${context.todaysTradeCount} total, P&L: $${context.todaysPnL.toFixed(2)}): ${JSON.stringify(context.todaysTrades.slice(0, 5))}
Active rules: ${JSON.stringify(context.activeRules)}
Prop firm account: ${JSON.stringify(context.propFirmAccount)}

Detect and report:
1. Rule violations — does this trade break any active rules? (max_trades_day, max_risk_trade, max_daily_loss)
2. Revenge trading — 2+ consecutive losses before this trade?
3. Overtrading — at or near daily trade limit?
4. Loss streak — 3+ losses in a row?
5. Execution pattern — execution scores declining over last 3 trades?
6. Prop firm risk — approaching drawdown or daily loss limit?
7. Positive patterns — win streak, improving execution, best instrument?

Think like a trading psychologist, not an accountant.
intervention_type must be one of: "revenge_trade", "overleveraged", "prop_firm_risk", "loss_streak", or null

Return this exact structure:
{"violations":[],"warnings":[],"patterns":[],"positives":[],"intervention_needed":false,"intervention_type":null}`,
      messages: [
        { role: 'user', content: 'Analyze current trading session.' },
        { role: 'assistant', content: '{' },
      ],
    })

    const raw = '{' + (result.content[0].type === 'text' ? result.content[0].text : '')
    const cleaned = raw.replace(/```json/g, '').replace(/```/g, '').trim()
    return JSON.parse(cleaned) as AnalystReport
  } catch (e) {
    console.error('[analyst] failed:', e)
    return { ...EMPTY }
  }
}
