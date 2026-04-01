import Anthropic from '@anthropic-ai/sdk'
import type { ProactiveParams, ProactiveGateOutput } from '@/types/trade'
import { ProactiveGateSchema } from '@/types/trade'
import { parseWithSchema } from '@/lib/claude/parser'
import { withRetry } from '@/lib/claude/retry'

export async function runProactiveGate(params: ProactiveParams): Promise<ProactiveGateOutput> {
  const fallback: ProactiveGateOutput = { should_speak: false, mode: 'greet', reason: 'fallback' }

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return fallback

    // Hard rate limit: never fire twice within 30 minutes
    if (params.lastProactiveAt) {
      const msSince = Date.now() - new Date(params.lastProactiveAt).getTime()
      if (msSince < 30 * 60 * 1000) return fallback
    }

    const anthropic = new Anthropic({ apiKey })
    const { trigger_type, traderPortrait, tradingDate, context, daysSinceLastSeen, user } = params

    const recentLossRun = (() => {
      const sorted = [...context.todaysTrades].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
      let streak = 0
      for (const t of sorted) {
        if ((Number(t.pnl) || 0) < 0) streak++
        else break
      }
      return streak
    })()

    const streakStr = context.currentStreak
      ? `${context.currentStreak.count}-day ${context.currentStreak.type} streak`
      : 'none'

    const drawdownNote = context.account?.daily_loss_limit && context.todaysPnL < 0
      ? `Today P&L ($${context.todaysPnL.toFixed(0)}) vs daily limit ($${context.account.daily_loss_limit})`
      : 'n/a'

    const system = `You are the inner decision-making process of ${user.buddy_name}, a trading companion.
One job: decide whether to initiate conversation with this trader right now, and which mode.

TRIGGER: ${trigger_type}

WHO THIS TRADER IS:
${traderPortrait || 'New trader — no history yet. Greet warmly if trigger is session_start.'}

TODAY: ${tradingDate} (${user.trading_timezone})
Trades: ${context.todaysTradeCount} | P&L: $${context.todaysPnL.toFixed(0)} | Win rate: ${context.todayWinRate}%
Weekly P&L: $${context.weeklyPnL.toFixed(0)} | ${context.weeklyTradeCount} trades
Consecutive losses right now: ${recentLossRun}
Streak: ${streakStr}
Drawdown vs limit: ${drawdownNote}
Days since last seen: ${daysSinceLastSeen}
Last proactive message: ${params.lastProactiveAt ? new Date(params.lastProactiveAt).toLocaleString() : 'never'}
Upcoming news: ${context.upcomingNews.length > 0 ? context.upcomingNews.map(n => n.event_name).join(', ') : 'none'}

MODE SELECTION GUIDE:
- greet: First open of trading day. For session_start trigger: speak = true unless already greeted today.
- celebrate: Meaningful win just logged. Speak only if it was notable — not every +$50 deserves it.
- check_in: Loss just logged. Speak sparingly — not every loss needs a response. Only if portrait suggests they struggle emotionally after losses.
- intervene: recentLossRun >= 3 OR P&L crossed daily loss limit. This matters — speak.
- debrief: Session clearly closing. Speak once, end of day.
- reconnect: daysSinceLastSeen >= 3. They've been away. Speak with warmth.
- milestone: currentStreak.count >= 3 wins, or today is a personal best. Speak.
- quiet: In app but nothing happening. Speak only if portrait suggests they benefit from check-ins — otherwise stay silent.
- banter: Slow day, market is open, no trades, no crisis. Use only when there's genuinely nothing else to say — just be entertaining. Fires at most once per session.

DECISION RULES:
- session_start → greet (true) or reconnect (if daysSinceLastSeen >= 3)
- returning_user → reconnect (true)
- loss_streak → intervene (true)
- eod_debrief → debrief (true)
- trade_logged with loss → check_in, but only if recentLossRun >= 2 or portrait says they spiral
- trade_logged with win → celebrate, only if win was significant (>= $200 or personal best)
- slow_day (no trades, market open, been in app 10+ min) → banter, only if no other trigger fired and portrait suggests they enjoy the character
- When in doubt: silence is better than noise. A bad proactive message destroys trust.

Return ONLY valid JSON:
{"should_speak":false,"mode":"greet","reason":"one sentence"}`

    const result = await withRetry(() => anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [
        { role: 'user' as const, content: 'Evaluate.' },
        { role: 'assistant' as const, content: '{' },
      ],
    }))

    const raw = result.content[0].type === 'text' ? '{' + result.content[0].text : ''
    const parsed = parseWithSchema(raw, ProactiveGateSchema)
    if (!parsed) return fallback

    console.log('[proactive-gate]', parsed.should_speak ? `SPEAK (${parsed.mode})` : 'SILENT', '—', parsed.reason)
    return parsed
  } catch (e) {
    console.error('[proactive-gate] failed:', e)
    return fallback
  }
}
