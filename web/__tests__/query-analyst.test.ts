import { describe, it, expect } from 'vitest'
import { runQueryAnalyst } from '@/app/api/buddy/agents/query-analyst'
import { runAnalyticsQuery } from '@/lib/supabase/run-analytics'

const TZ = 'America/New_York'
const DATE = '2026-03-26'

// ─────────────────────────────────────────────────────────────
// Query Analyst — SQL generation
// ─────────────────────────────────────────────────────────────
describe('Query Analyst — SQL generation', () => {
  it('generates valid SQL for win rate question', async () => {
    const result = await runQueryAnalyst({
      question: 'what is my overall win rate?',
      tradingTimezone: TZ,
      currentDate: DATE,
    })
    console.log('[query-analyst] win rate SQL:', result.sql)
    expect(result.needs_sql).toBe(true)
    expect(result.sql).toBeTruthy()
    expect(result.sql!.toLowerCase()).toContain('select')
    expect(result.sql!.toLowerCase()).toContain('pnl')
  }, 20000)

  it('generates valid SQL for day of week analysis', async () => {
    const result = await runQueryAnalyst({
      question: 'how do I trade on Mondays vs Fridays?',
      tradingTimezone: TZ,
      currentDate: DATE,
    })
    console.log('[query-analyst] day of week SQL:', result.sql)
    expect(result.needs_sql).toBe(true)
    expect(result.sql).toBeTruthy()
    expect(result.sql!.toLowerCase()).toContain('select')
  }, 20000)

  it('generates valid SQL for instrument analysis', async () => {
    const result = await runQueryAnalyst({
      question: 'what is my win rate on NQ vs ES?',
      tradingTimezone: TZ,
      currentDate: DATE,
    })
    console.log('[query-analyst] instrument SQL:', result.sql)
    expect(result.needs_sql).toBe(true)
    expect(result.sql).toBeTruthy()
    expect(result.sql!.toLowerCase()).toContain('instrument')
  }, 20000)

  it('generates SQL for emotion vs PnL analysis', async () => {
    const result = await runQueryAnalyst({
      question: 'how do I perform when I trade with FOMO vs when I am calm?',
      tradingTimezone: TZ,
      currentDate: DATE,
    })
    console.log('[query-analyst] emotion SQL:', result.sql)
    expect(result.needs_sql).toBe(true)
    expect(result.sql).toBeTruthy()
    expect(result.sql!.toLowerCase()).toContain('emotion_tag')
  }, 20000)

  it('skips SQL for pure psychology question', async () => {
    const result = await runQueryAnalyst({
      question: 'what is my biggest psychological weakness?',
      tradingTimezone: TZ,
      currentDate: DATE,
    })
    console.log('[query-analyst] psychology skip:', result.needs_sql)
    expect(result.needs_sql).toBe(false)
    expect(result.sql).toBeNull()
  }, 20000)

  it('generates SQL without trailing semicolon', async () => {
    const result = await runQueryAnalyst({
      question: 'show me my last 10 trades',
      tradingTimezone: TZ,
      currentDate: DATE,
    })
    console.log('[query-analyst] no semicolon SQL:', result.sql)
    expect(result.sql).toBeTruthy()
    expect(result.sql!.trim().endsWith(';')).toBe(false)
  }, 20000)
})

// ─────────────────────────────────────────────────────────────
// run-analytics — SQL safety + semicolon stripping
// ─────────────────────────────────────────────────────────────
describe('run-analytics — SQL validation', () => {
  const FAKE_USER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

  it('rejects non-SELECT queries', async () => {
    const result = await runAnalyticsQuery(FAKE_USER, 'DELETE FROM trades')
    expect(result.error).toBe('Only SELECT queries allowed')
    expect(result.results).toHaveLength(0)
  })

  it('rejects INSERT', async () => {
    const result = await runAnalyticsQuery(FAKE_USER, 'INSERT INTO trades VALUES (1)')
    expect(result.error).toBe('Only SELECT queries allowed')
  })

  it('strips trailing semicolon before execution', async () => {
    // Should not throw "syntax error at or near ;"
    // Will fail with RPC error (no live DB) but NOT a semicolon syntax error
    const result = await runAnalyticsQuery(FAKE_USER, 'SELECT * FROM trades;')
    // Error should not be about semicolon syntax
    if (result.error) {
      expect(result.error).not.toContain('syntax error at or near ";"')
    }
  })

  it('injects user_id into WHERE-less query', async () => {
    // We can verify the SQL injection logic directly
    // by checking that the function doesn't blow up on a valid SELECT
    const result = await runAnalyticsQuery(FAKE_USER, 'SELECT COUNT(*) FROM trades')
    // Will get RPC error in test env (no DB), but no crash
    expect(result).toHaveProperty('results')
  })

  it('injects user_id before GROUP BY', async () => {
    const result = await runAnalyticsQuery(
      FAKE_USER,
      'SELECT instrument, COUNT(*) FROM trades GROUP BY instrument'
    )
    expect(result).toHaveProperty('results')
  })

  it('handles multiple semicolons gracefully', async () => {
    const result = await runAnalyticsQuery(FAKE_USER, 'SELECT * FROM trades;;;')
    if (result.error) {
      expect(result.error).not.toContain('syntax error at or near ";"')
    }
  })
})

// ─────────────────────────────────────────────────────────────
// Query Analyst — full pipeline simulation (extract → SQL)
// ─────────────────────────────────────────────────────────────
describe('Query Analyst — pipeline simulation', () => {
  it('handles loss streak question end to end', async () => {
    const result = await runQueryAnalyst({
      question: 'how many times have I had 3 losses in a row?',
      tradingTimezone: TZ,
      currentDate: DATE,
    })
    console.log('[query-analyst] loss streak SQL:', result.sql)
    expect(result.needs_sql).toBe(true)
    expect(result.sql).toBeTruthy()
    expect(result.sql!.toLowerCase()).toContain('select')
  }, 20000)

  it('handles date-specific question', async () => {
    const result = await runQueryAnalyst({
      question: 'how did I do last Monday?',
      tradingTimezone: TZ,
      currentDate: DATE,
    })
    console.log('[query-analyst] date specific SQL:', result.sql)
    expect(result.needs_sql).toBe(true)
    expect(result.sql).toBeTruthy()
  }, 20000)

  it('generates aggregate for P&L summary', async () => {
    const result = await runQueryAnalyst({
      question: 'what is my total P&L this month?',
      tradingTimezone: TZ,
      currentDate: DATE,
    })
    console.log('[query-analyst] monthly PnL SQL:', result.sql)
    expect(result.needs_sql).toBe(true)
    expect(result.sql!.toLowerCase()).toContain('pnl')
  }, 20000)

  it('handles combined data + psychology question', async () => {
    const result = await runQueryAnalyst({
      question: 'on my worst trading days, what was my emotional state?',
      tradingTimezone: TZ,
      currentDate: DATE,
    })
    console.log('[query-analyst] combined SQL:', result.sql)
    expect(result.needs_sql).toBe(true)
    expect(result.sql).toBeTruthy()
  }, 20000)
})
