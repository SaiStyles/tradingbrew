/**
 * Buddy agent tests
 * Tests the most user-facing agent — tone, rules, personality, intervention, historical query
 */
import { describe, it, expect } from 'vitest'
import { runBuddy } from '@/app/api/buddy/agents/buddy'
import type { ExtractedData, ContextPacket, AnalystReport, ChatMessage } from '@/types/trade'

const TZ = 'America/New_York'
const DATE = '2026-03-24'

const defaultUser = {
  buddy_name: 'Buddy',
  buddy_personality: 'Friendly Mentor — warm, direct, real',
  trading_timezone: TZ,
}

const emptyExtracted: ExtractedData = {
  instrument: null, direction: null, pnl: null,
  opened_at: null, closed_at: null, position_size: null,
  emotion: null, execution_score: null, followed_plan: null,
  market_condition: null,
  confirmed: false, declined: false, has_trade: false,
  query_type: null, query_subtype: null,
}

const emptyContext: ContextPacket = {
  todaysTrades: [], todaysTradeCount: 0, todaysPnL: 0,
  todayWinRate: 0, todayAvgPnL: 0,
  weeklyPnL: 0, weeklyTradeCount: 0, weeklyWinRate: 0,
  currentStreak: null, active_rules: [], account: null,
  memories: [], upcomingNews: [], dataError: false,
  historicalQuery: null,
}

const noAnalysis: AnalystReport = {
  violations: [], warnings: [], patterns: [], positives: [],
  intervention_needed: false, intervention_type: null,
}

// ─────────────────────────────────────────────────────────────
// TEST 1: Returns a non-empty string
// ─────────────────────────────────────────────────────────────
describe('Buddy — basic response', () => {
  it('returns a non-empty string for any message', async () => {
    const reply = await runBuddy({
      message: 'gm',
      extracted: emptyExtracted,
      context: emptyContext,
      analysis: noAnalysis,
      messages: [],
      tradingDate: DATE,
      traderPortrait: '',
      user: defaultUser,
      model: 'claude-haiku-4-5-20251001',
    })
    console.log('[buddy-test1] reply:', reply)
    expect(typeof reply).toBe('string')
    expect(reply.trim().length).toBeGreaterThan(0)
    expect(reply).not.toBe('Give me a second...')
  }, 20000)
})

// ─────────────────────────────────────────────────────────────
// TEST 2: Small talk — stays short, no trade agenda
// ─────────────────────────────────────────────────────────────
describe('Buddy — small talk', () => {
  it('responds concisely to casual message without pushing trades', async () => {
    const reply = await runBuddy({
      message: 'markets are wild today bro',
      extracted: emptyExtracted,
      context: emptyContext,
      analysis: noAnalysis,
      messages: [],
      tradingDate: DATE,
      traderPortrait: '',
      user: defaultUser,
      model: 'claude-haiku-4-5-20251001',
    })
    console.log('[buddy-test2] reply:', reply)
    const wordCount = reply.trim().split(/\s+/).length
    console.log('[buddy-test2] word count:', wordCount)
    expect(typeof reply).toBe('string')
    expect(reply.trim().length).toBeGreaterThan(0)
    // Short message = short reply (under 60 words)
    expect(wordCount).toBeLessThan(60)
  }, 20000)
})

// ─────────────────────────────────────────────────────────────
// TEST 3: Never references memory directly
// ─────────────────────────────────────────────────────────────
describe('Buddy — no memory leaking', () => {
  it('does not say "I remember" or "you mentioned" or "your data shows"', async () => {
    const reply = await runBuddy({
      message: 'just lost 800 on NQ, feeling terrible',
      extracted: { ...emptyExtracted, has_trade: true, instrument: 'NQ', pnl: -800, emotion: 'frustrated' },
      context: {
        ...emptyContext,
        memories: [
          'Trader tends to revenge trade after 3 consecutive losses on NQ',
          'Family financial pressure mentioned multiple times — amplifies loss reactions',
        ],
      },
      analysis: noAnalysis,
      messages: [],
      tradingDate: DATE,
      traderPortrait: 'Trader struggles with NQ specifically. Has mentioned financial pressure at home.',
      user: defaultUser,
      model: 'claude-haiku-4-5-20251001',
    })
    console.log('[buddy-test3] reply:', reply)
    const lower = reply.toLowerCase()
    expect(lower).not.toMatch(/i remember/i)
    expect(lower).not.toMatch(/you mentioned/i)
    expect(lower).not.toMatch(/your data shows/i)
    expect(lower).not.toMatch(/according to/i)
    expect(lower).not.toMatch(/in the past you/i)
  }, 20000)
})

// ─────────────────────────────────────────────────────────────
// TEST 4: Intervention — addresses it first
// ─────────────────────────────────────────────────────────────
describe('Buddy — intervention handling', () => {
  it('addresses intervention before anything else when intervention_needed = true', async () => {
    const reply = await runBuddy({
      message: 'taking another trade, 4th one after 3 losses, NQ short',
      extracted: { ...emptyExtracted, has_trade: true, instrument: 'NQ', direction: 'short', emotion: 'revenge' },
      context: {
        ...emptyContext,
        todaysTrades: [
          { instrument: 'NQ', direction: 'long', pnl: -400, execution_score: null, emotion_tag: 'frustrated', opened_at: `${DATE}T09:30:00-04:00`, closed_at: `${DATE}T09:45:00-04:00` },
          { instrument: 'NQ', direction: 'long', pnl: -300, execution_score: null, emotion_tag: 'frustrated', opened_at: `${DATE}T10:00:00-04:00`, closed_at: `${DATE}T10:15:00-04:00` },
          { instrument: 'NQ', direction: 'long', pnl: -500, execution_score: null, emotion_tag: 'revenge', opened_at: `${DATE}T10:30:00-04:00`, closed_at: `${DATE}T10:45:00-04:00` },
        ] as any,
        todaysTradeCount: 3,
        todaysPnL: -1200,
      },
      analysis: {
        violations: [],
        warnings: ['3 consecutive losses — revenge trading risk'],
        patterns: ['Loss streak with escalating position aggression'],
        positives: [],
        intervention_needed: true,
        intervention_type: 'revenge_trading',
      },
      messages: [],
      tradingDate: DATE,
      traderPortrait: '',
      user: defaultUser,
      model: 'claude-haiku-4-5-20251001',
    })
    console.log('[buddy-test4] reply:', reply)
    expect(typeof reply).toBe('string')
    expect(reply.trim().length).toBeGreaterThan(0)
    // Reply should NOT be cheerful or trade-logging focused — should feel like a pause
    const lower = reply.toLowerCase()
    const hasIntervention = lower.includes('stop') || lower.includes('step') || lower.includes('pause') || lower.includes('walk') || lower.includes('hold') || lower.includes('down') || lower.includes('loss') || lower.includes('three') || lower.includes('3')
    console.log('[buddy-test4] intervention signal in reply:', hasIntervention)
    expect(hasIntervention).toBe(true)
  }, 20000)
})

// ─────────────────────────────────────────────────────────────
// TEST 5: Historical query — tells a story, not a data dump
// ─────────────────────────────────────────────────────────────
describe('Buddy — historical query response', () => {
  it('narrates data as a story, not raw numbers', async () => {
    const reply = await runBuddy({
      message: 'how do I do on Mondays?',
      extracted: { ...emptyExtracted, query_type: 'historical_analysis', query_subtype: 'data' },
      context: {
        ...emptyContext,
        historicalQuery: {
          query_description: 'Trading performance on Mondays',
          results: [
            { day_of_week: 2, trade_count: 18, total_pnl: -1240, win_rate: 33.3 },
          ],
        },
      },
      analysis: null,
      messages: [],
      tradingDate: DATE,
      traderPortrait: '',
      user: defaultUser,
      model: 'claude-haiku-4-5-20251001',
    })
    console.log('[buddy-test5] reply:', reply)
    expect(typeof reply).toBe('string')
    expect(reply.trim().length).toBeGreaterThan(0)
    // Should reference Monday performance in some way
    const lower = reply.toLowerCase()
    const hasMonday = lower.includes('monday') || lower.includes('start of the week') || lower.includes('week')
    expect(hasMonday).toBe(true)
  }, 20000)
})

// ─────────────────────────────────────────────────────────────
// TEST 6: Personality — different personalities, different tone
// ─────────────────────────────────────────────────────────────
describe('Buddy — personality system', () => {
  it('Drill Sergeant and Zen Master produce different responses to same loss', async () => {
    const sharedParams = {
      message: 'lost 600 today, feeling bad',
      extracted: { ...emptyExtracted, has_trade: true, pnl: -600, emotion: 'frustrated' },
      context: emptyContext,
      analysis: noAnalysis,
      messages: [] as ChatMessage[],
      tradingDate: DATE,
      traderPortrait: '',
      model: 'claude-haiku-4-5-20251001',
    }

    const [drillReply, zenReply] = await Promise.all([
      runBuddy({ ...sharedParams, user: { ...defaultUser, buddy_name: 'Sarge', buddy_personality: 'Drill Sergeant — tough love, no excuses, push harder' } }),
      runBuddy({ ...sharedParams, user: { ...defaultUser, buddy_name: 'Zen', buddy_personality: 'Zen Master — calm, philosophical, no judgment, breathe through it' } }),
    ])

    console.log('[buddy-test6] drill:', drillReply)
    console.log('[buddy-test6] zen:', zenReply)

    expect(drillReply.trim().length).toBeGreaterThan(0)
    expect(zenReply.trim().length).toBeGreaterThan(0)
    // They should be meaningfully different
    expect(drillReply.toLowerCase()).not.toBe(zenReply.toLowerCase())
  }, 30000)
})

// ─────────────────────────────────────────────────────────────
// TEST 7: Win — Buddy acknowledges positively, doesn't lecture
// ─────────────────────────────────────────────────────────────
describe('Buddy — positive trade handling', () => {
  it('acknowledges a good trade without being clinical or preachy', async () => {
    const reply = await runBuddy({
      message: 'just made 800 on ES long, followed the plan perfectly',
      extracted: { ...emptyExtracted, has_trade: true, instrument: 'ES', direction: 'long', pnl: 800, emotion: 'confident', followed_plan: true },
      context: { ...emptyContext, todaysPnL: 800, todaysTradeCount: 1, todayWinRate: 100 },
      analysis: {
        violations: [], warnings: [], patterns: [],
        positives: ['Clean execution, followed plan on a winning trade'],
        intervention_needed: false, intervention_type: null,
      },
      messages: [],
      tradingDate: DATE,
      traderPortrait: '',
      user: defaultUser,
      model: 'claude-haiku-4-5-20251001',
    })
    console.log('[buddy-test7] reply:', reply)
    expect(typeof reply).toBe('string')
    expect(reply.trim().length).toBeGreaterThan(0)
    // Should not sound clinical
    const lower = reply.toLowerCase()
    expect(lower).not.toMatch(/excellent execution demonstrating/i)
    expect(lower).not.toMatch(/your win rate/i)
    expect(lower).not.toMatch(/statistically/i)
  }, 20000)
})
