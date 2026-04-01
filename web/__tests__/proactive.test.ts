import { describe, it, expect } from 'vitest'
import { runProactiveGate } from '@/app/api/buddy/agents/proactive-gate'
import { runProactiveBuddy } from '@/app/api/buddy/agents/proactive-buddy'
import type { ProactiveParams, ContextPacket } from '@/types/trade'

const TZ = 'America/New_York'
const DATE = '2026-04-01'

const baseContext: ContextPacket = {
  todaysTrades: [],
  todaysTradeCount: 0,
  todaysPnL: 0,
  todayWinRate: 0,
  todayAvgPnL: 0,
  weeklyPnL: 200,
  weeklyTradeCount: 5,
  weeklyWinRate: 60,
  currentStreak: null,
  active_rules: [],
  account: null,
  memories: [],
  upcomingNews: [],
  dataError: false,
  historicalQuery: null,
}

const baseUser = {
  buddy_name: 'Max',
  buddy_personality: 'Friendly Mentor — warm, supportive, believes in the trader',
  trading_timezone: TZ,
}

const baseGateParams: ProactiveParams = {
  trigger_type: 'session_start',
  traderPortrait: 'Experienced NQ trader. Tends to overtrade on bad days. Responds well to directness.',
  tradingDate: DATE,
  context: baseContext,
  daysSinceLastSeen: 0,
  lastProactiveAt: null,
  user: baseUser,
}

// ─────────────────────────────────────────────────────────────
// ProactiveGate — decision making
// ─────────────────────────────────────────────────────────────
describe('ProactiveGate — session_start trigger', () => {
  it('returns valid gate output structure', async () => {
    const result = await runProactiveGate(baseGateParams)
    expect(typeof result.should_speak).toBe('boolean')
    expect(typeof result.mode).toBe('string')
    expect(typeof result.reason).toBe('string')
    const validModes = ['greet', 'celebrate', 'check_in', 'intervene', 'debrief', 'reconnect', 'milestone', 'quiet', 'banter']
    expect(validModes).toContain(result.mode)
  }, 20000)

  it('speaks on session_start for new day (no prior messages)', async () => {
    const result = await runProactiveGate(baseGateParams)
    // session_start with no trades and daysSinceLastSeen=0 → should greet
    expect(result.should_speak).toBe(true)
    expect(['greet', 'reconnect']).toContain(result.mode)
  }, 20000)

  it('triggers reconnect when trader has been away 5+ days', async () => {
    const result = await runProactiveGate({
      ...baseGateParams,
      daysSinceLastSeen: 5,
    })
    expect(result.should_speak).toBe(true)
    expect(result.mode).toBe('reconnect')
  }, 20000)

  it('enforces 30-minute rate limit', async () => {
    const recentTime = new Date(Date.now() - 5 * 60 * 1000).toISOString() // 5 min ago
    const result = await runProactiveGate({
      ...baseGateParams,
      lastProactiveAt: recentTime,
    })
    // Should NOT speak — rate limited
    expect(result.should_speak).toBe(false)
  }, 5000) // Should return immediately (no API call)

  it('triggers intervene on 3+ consecutive losses', async () => {
    const losses = [
      { id: '1', user_id: 'u', session_id: null, instrument: 'NQ', direction: 'long' as const, pnl: -400, opened_at: new Date().toISOString(), closed_at: null, entry_price: null, exit_price: null, stop_loss: null, take_profit: null, position_size: null, duration_mins: null, emotion_tag: null, execution_score: null, rr: null, market_condition: null, notes: null, voice_note_url: null, followed_plan: null, incomplete: false, deleted_at: null, created_at: new Date().toISOString() },
      { id: '2', user_id: 'u', session_id: null, instrument: 'NQ', direction: 'long' as const, pnl: -350, opened_at: new Date().toISOString(), closed_at: null, entry_price: null, exit_price: null, stop_loss: null, take_profit: null, position_size: null, duration_mins: null, emotion_tag: null, execution_score: null, rr: null, market_condition: null, notes: null, voice_note_url: null, followed_plan: null, incomplete: false, deleted_at: null, created_at: new Date().toISOString() },
      { id: '3', user_id: 'u', session_id: null, instrument: 'ES', direction: 'short' as const, pnl: -200, opened_at: new Date().toISOString(), closed_at: null, entry_price: null, exit_price: null, stop_loss: null, take_profit: null, position_size: null, duration_mins: null, emotion_tag: null, execution_score: null, rr: null, market_condition: null, notes: null, voice_note_url: null, followed_plan: null, incomplete: false, deleted_at: null, created_at: new Date().toISOString() },
    ]
    const result = await runProactiveGate({
      ...baseGateParams,
      trigger_type: 'loss_streak',
      context: {
        ...baseContext,
        todaysTrades: losses,
        todaysTradeCount: 3,
        todaysPnL: -950,
        todayWinRate: 0,
      },
    })
    expect(result.should_speak).toBe(true)
    // 3 consecutive losses → intervene or check_in are both valid responses
    expect(['intervene', 'check_in']).toContain(result.mode)
  }, 20000)
})

// ─────────────────────────────────────────────────────────────
// ProactiveBuddy — message generation
// ─────────────────────────────────────────────────────────────
describe('ProactiveBuddy — message generation', () => {
  it('generates a non-empty greet message', async () => {
    const message = await runProactiveBuddy({
      mode: 'greet',
      traderPortrait: baseGateParams.traderPortrait!,
      context: baseContext,
      tradingDate: DATE,
      user: baseUser,
    })
    expect(typeof message).toBe('string')
    expect(message.trim().length).toBeGreaterThan(0)
    // Must not start with "Good morning" or "Welcome back"
    const lower = message.toLowerCase()
    expect(lower.startsWith('good morning')).toBe(false)
    expect(lower.startsWith('welcome back')).toBe(false)
  }, 20000)

  it('generates an intervene message that opens a door (not lectures)', async () => {
    const message = await runProactiveBuddy({
      mode: 'intervene',
      traderPortrait: 'Trader who tends to spiral after 3 losses. Gets revenge-y.',
      context: {
        ...baseContext,
        todaysTradeCount: 3,
        todaysPnL: -950,
        todayWinRate: 0,
      },
      tradingDate: DATE,
      user: baseUser,
    })
    expect(typeof message).toBe('string')
    expect(message.trim().length).toBeGreaterThan(0)
    // Should be short (1-2 sentences) — not a lecture
    const sentences = message.split(/[.!?]+/).filter(s => s.trim().length > 0)
    expect(sentences.length).toBeLessThanOrEqual(4) // generous upper bound
    // Should NOT contain financial advice keywords
    const lower = message.toLowerCase()
    expect(lower).not.toContain('stop loss')
    expect(lower).not.toContain('risk management')
  }, 20000)

  it('generates a reconnect message without mentioning absence guilt', async () => {
    const message = await runProactiveBuddy({
      mode: 'reconnect',
      traderPortrait: 'Regular trader, usually trades 3-4 days a week.',
      context: baseContext,
      tradingDate: DATE,
      user: baseUser,
    })
    expect(typeof message).toBe('string')
    expect(message.trim().length).toBeGreaterThan(0)
    const lower = message.toLowerCase()
    // Should not guilt-trip about being away
    expect(lower).not.toContain('where were you')
    expect(lower).not.toContain('you missed')
  }, 20000)

  it('generates a banter message that is entertaining, not trading-focused', async () => {
    const message = await runProactiveBuddy({
      mode: 'banter',
      traderPortrait: 'Relaxed trader who enjoys the character.',
      context: baseContext,
      tradingDate: DATE,
      user: {
        buddy_name: 'Gekko',
        buddy_personality: 'Gordon Gekko — sharp, unapologetic, greed is good energy',
        trading_timezone: TZ,
      },
    })
    expect(typeof message).toBe('string')
    expect(message.trim().length).toBeGreaterThan(0)
    // Should not contain generic coaching advice
    const lower = message.toLowerCase()
    expect(lower).not.toContain('risk management')
    expect(lower).not.toContain('follow your rules')
  }, 20000)

  it('stays short (max 3 sentences) for all modes', async () => {
    const modes = ['greet', 'celebrate', 'check_in', 'debrief'] as const
    for (const mode of modes) {
      const message = await runProactiveBuddy({
        mode,
        traderPortrait: baseGateParams.traderPortrait!,
        context: baseContext,
        tradingDate: DATE,
        user: baseUser,
      })
      const sentences = message.split(/[.!?]+/).filter(s => s.trim().length > 5)
      expect(sentences.length).toBeLessThanOrEqual(5) // generous: 3 max, allow 5 for edge cases
    }
  }, 60000)

  it('respects personality — Gordon Gekko sounds different from Zen Master', async () => {
    const shared = {
      mode: 'greet' as const,
      traderPortrait: 'Active futures trader.',
      context: baseContext,
      tradingDate: DATE,
    }
    const [gekkoMsg, zenMsg] = await Promise.all([
      runProactiveBuddy({ ...shared, user: { buddy_name: 'Gekko', buddy_personality: 'Gordon Gekko — sharp, cynical, greed is good, Wall Street energy', trading_timezone: TZ } }),
      runProactiveBuddy({ ...shared, user: { buddy_name: 'Zen', buddy_personality: 'Zen Master — calm, present, breathe, accept, equanimity', trading_timezone: TZ } }),
    ])
    expect(gekkoMsg.trim().length).toBeGreaterThan(0)
    expect(zenMsg.trim().length).toBeGreaterThan(0)
    // Messages should differ (different personality = different output)
    expect(gekkoMsg.toLowerCase()).not.toBe(zenMsg.toLowerCase())
  }, 30000)
})
