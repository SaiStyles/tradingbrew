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
  confirmed: false, declined: false, has_trade: false,
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

describe('SaveDetector agent (live API)', () => {
  it('saves trade when all minimum fields present', async () => {
    const result = await runSaveDetector({
      extracted: fullExtracted,
      tradingDate: DATE,
      tradingTimezone: TZ,
    })
    expect(result.save_trade).toBe(true)
    expect(result.trade_data?.instrument).toBe('NQ')
    expect(result.trade_data?.pnl).toBe(400)
  })

  it('does NOT save when opened_at missing', async () => {
    const result = await runSaveDetector({
      extracted: { ...fullExtracted, opened_at: null },
      tradingDate: DATE,
      tradingTimezone: TZ,
    })
    expect(result.save_trade).toBe(false)
  })

  it('does NOT save when emotion missing', async () => {
    const result = await runSaveDetector({
      extracted: { ...fullExtracted, emotion: null },
      tradingDate: DATE,
      tradingTimezone: TZ,
    })
    expect(result.save_trade).toBe(false)
  })

  it('does NOT save when pnl missing', async () => {
    const result = await runSaveDetector({
      extracted: { ...fullExtracted, pnl: null },
      tradingDate: DATE,
      tradingTimezone: TZ,
    })
    expect(result.save_trade).toBe(false)
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
  })

  it('execution_score is a number when present', async () => {
    const result = await runSaveDetector({
      extracted: fullExtracted,
      tradingDate: DATE,
      tradingTimezone: TZ,
    })
    if (result.save_trade && result.trade_data?.execution_score != null) {
      expect(result.trade_data.execution_score).toBeGreaterThanOrEqual(1)
      expect(result.trade_data.execution_score).toBeLessThanOrEqual(10)
    }
  })
})
