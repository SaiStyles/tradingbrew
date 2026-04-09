import { describe, it, expect } from 'vitest'
import { runSaveDetector } from '@/app/api/buddy/agents/save-detector'
import type { ExtractedData } from '@/types/trade'

const TZ = 'America/New_York'
const DATE = '2026-03-23'

const emptyExtracted: ExtractedData = {
  instrument: null, direction: null, pnl: null,
  opened_at: null, closed_at: null,
  position_size: null,
  emotion: null, execution_score: null,
  followed_plan: null, market_condition: null,
  confirmed: false, declined: false, has_trade: false, more_trades: false,
  exit_reason: null, rr: null, session: null,
  query_type: null, query_subtype: null,
}

const fullExtracted: ExtractedData = {
  ...emptyExtracted,
  has_trade: true,
  instrument: 'NQ',
  direction: 'long',
  pnl: 400,
  opened_at: `${DATE}T09:30:00-05:00`,
  emotion: 'confident',
  execution_score: 8,
  followed_plan: true,
}

describe('SaveDetector (pure TS)', () => {
  it('saves trade when instrument + pnl present', async () => {
    const result = await runSaveDetector({
      extracted: fullExtracted,
      tradingDate: DATE,
      tradingTimezone: TZ,
    })
    expect(result.save_trade).toBe(true)
    expect(result.trade_data?.instrument).toBe('NQ')
    expect(result.trade_data?.pnl).toBe(400)
  })

  it('includes optional fields when present', async () => {
    const result = await runSaveDetector({
      extracted: fullExtracted,
      tradingDate: DATE,
      tradingTimezone: TZ,
    })
    expect(result.save_trade).toBe(true)
    expect(result.trade_data?.direction).toBe('long')
    expect(result.trade_data?.emotion_tag).toBe('confident')
    expect(result.trade_data?.execution_score).toBe(8)
    expect(result.trade_data?.followed_plan).toBe(true)
    expect(result.trade_data?.opened_at).toBe(`${DATE}T09:30:00-05:00`)
  })

  it('does NOT save when instrument missing', async () => {
    const result = await runSaveDetector({
      extracted: { ...fullExtracted, instrument: null },
      tradingDate: DATE,
      tradingTimezone: TZ,
    })
    expect(result.save_trade).toBe(false)
    expect(result.trade_data).toBeNull()
  })

  it('does NOT save when pnl missing', async () => {
    const result = await runSaveDetector({
      extracted: { ...fullExtracted, pnl: null },
      tradingDate: DATE,
      tradingTimezone: TZ,
    })
    expect(result.save_trade).toBe(false)
    expect(result.trade_data).toBeNull()
  })

  it('saves with only instrument + pnl (minimum fields)', async () => {
    const result = await runSaveDetector({
      extracted: { ...emptyExtracted, has_trade: true, instrument: 'ES', pnl: -200 },
      tradingDate: DATE,
      tradingTimezone: TZ,
    })
    expect(result.save_trade).toBe(true)
    expect(result.trade_data?.instrument).toBe('ES')
    expect(result.trade_data?.pnl).toBe(-200)
    // Optional fields should be absent
    expect(result.trade_data?.direction).toBeUndefined()
    expect(result.trade_data?.emotion_tag).toBeUndefined()
  })

  it('saves short trade with correct direction', async () => {
    const result = await runSaveDetector({
      extracted: {
        ...fullExtracted,
        instrument: 'ES',
        direction: 'short',
        pnl: -150,
        emotion: 'frustrated',
        followed_plan: false,
      },
      tradingDate: DATE,
      tradingTimezone: TZ,
    })
    expect(result.save_trade).toBe(true)
    expect(result.trade_data?.direction).toBe('short')
    expect(result.trade_data?.pnl).toBe(-150)
    expect(result.trade_data?.followed_plan).toBe(false)
  })

  it('saves breakeven trade (pnl = 0)', async () => {
    const result = await runSaveDetector({
      extracted: { ...fullExtracted, pnl: 0 },
      tradingDate: DATE,
      tradingTimezone: TZ,
    })
    expect(result.save_trade).toBe(true)
    expect(result.trade_data?.pnl).toBe(0)
  })

  it('includes exit_reason and session when present', async () => {
    const result = await runSaveDetector({
      extracted: { ...fullExtracted, exit_reason: 'Stop out', session: 'new_york' },
      tradingDate: DATE,
      tradingTimezone: TZ,
    })
    expect(result.save_trade).toBe(true)
    expect(result.trade_data?.exit_reason).toBe('Stop out')
    expect(result.trade_data?.session).toBe('new_york')
  })

  it('does NOT save empty extraction', async () => {
    const result = await runSaveDetector({
      extracted: emptyExtracted,
      tradingDate: DATE,
      tradingTimezone: TZ,
    })
    expect(result.save_trade).toBe(false)
  })

  it('reply is always empty string', async () => {
    const result = await runSaveDetector({
      extracted: fullExtracted,
      tradingDate: DATE,
      tradingTimezone: TZ,
    })
    expect(result.reply).toBe('')
  })
})
