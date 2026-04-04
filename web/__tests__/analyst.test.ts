import { describe, it, expect } from 'vitest'
import { runAnalyst } from '@/app/api/buddy/agents/analyst'
import type { ExtractedData, ContextPacket, TradeRecord } from '@/types/trade'

const emptyExtracted: ExtractedData = {
  instrument: null, direction: null, pnl: null,
  opened_at: null, closed_at: null,
  position_size: null,
  emotion: null, execution_score: null,
  followed_plan: null, market_condition: null,
  confirmed: false, declined: false, has_trade: false,
  exit_reason: null, rr: null, session: null,
  query_type: null, query_subtype: null,
}

const emptyContext: ContextPacket = {
  todaysTrades: [],
  todaysTradeCount: 0,
  todaysPnL: 0,
  todayWinRate: 0,
  todayAvgPnL: 0,
  weeklyPnL: 0,
  weeklyTradeCount: 0,
  weeklyWinRate: 0,
  currentStreak: null,
  active_rules: [],
  account: null,
  memories: [],
  upcomingNews: [],
  dataError: false,
  historicalQuery: null,
}

function makeTrade(overrides: Partial<TradeRecord>): TradeRecord {
  return {
    id: 'test-id',
    user_id: 'test-user',
    session_id: null,
    instrument: 'NQ',
    direction: 'long',
    entry_price: null,
    exit_price: null,
    stop_loss: null,
    pnl: null,
    position_size: null,
    session: null,
    opened_at: null,
    closed_at: null,
    emotion_tag: null,
    execution_score: null,
    rr: null,
    market_condition: null,
    setup_type: null,
    exit_reason: null,
    mistakes: [],
    notes: null,
    voice_note_url: null,
    followed_plan: null,
    incomplete: false,
    deleted_at: null,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

describe('Analyst agent (live API)', () => {
  it('returns valid structure with empty data', async () => {
    const result = await runAnalyst(emptyExtracted, emptyContext)
    expect(result).toBeDefined()
    expect(Array.isArray(result.violations)).toBe(true)
    expect(Array.isArray(result.warnings)).toBe(true)
    expect(Array.isArray(result.patterns)).toBe(true)
    expect(Array.isArray(result.positives)).toBe(true)
    expect(typeof result.intervention_needed).toBe('boolean')
  })

  it('detects rule violation when rule is broken', async () => {
    const extracted: ExtractedData = {
      ...emptyExtracted,
      has_trade: true,
      instrument: 'NQ',
      direction: 'long',
      pnl: -500,
      emotion: 'frustrated',
    }
    const context: ContextPacket = {
      ...emptyContext,
      active_rules: [
        { id: 'rule-1', raw_text: 'Do not trade when frustrated' },
      ],
    }
    const result = await runAnalyst(extracted, context)
    expect(result.violations.length + result.warnings.length).toBeGreaterThan(0)
  })

  it('detects revenge trading pattern on 3 consecutive losses', async () => {
    const context: ContextPacket = {
      ...emptyContext,
      todaysTrades: [
        makeTrade({ pnl: -200, execution_score: 4, emotion_tag: 'frustrated', opened_at: '09:00', closed_at: '09:15' }),
        makeTrade({ pnl: -300, execution_score: 3, emotion_tag: 'frustrated', opened_at: '09:20', closed_at: '09:35' }),
        makeTrade({ pnl: -400, execution_score: 2, emotion_tag: 'revenge', opened_at: '09:40', closed_at: '09:55' }),
      ],
      todaysTradeCount: 3,
      todaysPnL: -900,
    }
    const result = await runAnalyst(emptyExtracted, context)
    const allText = [...result.warnings, ...result.patterns, ...result.violations.map(v => v.reasoning)].join(' ')
    expect(allText.length).toBeGreaterThan(0)
  })

  it('returns positives on a clean, well-executed trade', async () => {
    const extracted: ExtractedData = {
      ...emptyExtracted,
      has_trade: true,
      instrument: 'ES',
      direction: 'long',
      pnl: 600,
      emotion: 'calm',
      execution_score: 9,
      followed_plan: true,
    }
    const result = await runAnalyst(extracted, emptyContext)
    expect(result.positives.length).toBeGreaterThan(0)
    expect(result.intervention_needed).toBe(false)
  })

  it('warnings and patterns are plain strings not objects', async () => {
    const extracted: ExtractedData = {
      ...emptyExtracted,
      has_trade: true,
      instrument: 'NQ',
      direction: 'short',
      pnl: -800,
      emotion: 'revenge',
    }
    const result = await runAnalyst(extracted, emptyContext)
    for (const w of result.warnings) {
      expect(typeof w).toBe('string')
    }
    for (const p of result.patterns) {
      expect(typeof p).toBe('string')
    }
  })

  it('does not flag missing fields as violations', async () => {
    const extracted: ExtractedData = {
      ...emptyExtracted,
      has_trade: true,
      instrument: 'NQ',
    }
    const result = await runAnalyst(extracted, emptyContext)
    const reasonings = result.violations.map(v => v.reasoning.toLowerCase()).join(' ')
    expect(reasonings).not.toMatch(/missing|not provided|null/)
  })
})
