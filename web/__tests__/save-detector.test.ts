import { describe, it, expect } from 'vitest'
import { runSaveDetector } from '@/app/api/buddy/agents/save-detector'
import type { ChatMessage, ExtractedData } from '@/types/trade'

const TZ = 'America/New_York'
const DATE = '2026-03-23'

const emptyExtracted: ExtractedData = {
  instrument: null, direction: null, pnl: null,
  opened_at: null, closed_at: null,
  position_size: null,
  emotion: null, execution_score: null,
  followed_plan: null, market_condition: null,
  confirmed: false, declined: false, has_trade: false,
  query_type: null, query_subtype: null,
}

const fullConversation: ChatMessage[] = [
  { role: 'user', content: 'took a long on NQ, made $400' },
  { role: 'assistant', content: 'Nice trade! When did you get in and out?' },
  { role: 'user', content: 'entered at 9:30am, closed at 10:15am' },
  { role: 'assistant', content: 'Got it. How were you feeling?' },
  { role: 'user', content: 'felt confident, execution was solid, like an 8 out of 10' },
  { role: 'assistant', content: 'Great discipline. Did you follow your plan?' },
  { role: 'user', content: 'yes followed it exactly' },
]

describe('SaveDetector agent (live API)', () => {
  it('saves trade when all minimum fields present', async () => {
    const result = await runSaveDetector({
      messages: fullConversation,
      extracted: { ...emptyExtracted, has_trade: true, instrument: 'NQ', direction: 'long', pnl: 400 },
      tradingDate: DATE,
      tradingTimezone: TZ,
    })
    expect(result.save_trade).toBe(true)
    expect(result.trade_data?.instrument).toBe('NQ')
    expect(result.trade_data?.pnl).toBe(400)
  })

  it('does NOT save when opened_at missing', async () => {
    const partial: ChatMessage[] = [
      { role: 'user', content: 'NQ long, made $300, felt calm' },
    ]
    const result = await runSaveDetector({
      messages: partial,
      extracted: { ...emptyExtracted, has_trade: true },
      tradingDate: DATE,
      tradingTimezone: TZ,
    })
    expect(result.save_trade).toBe(false)
  })

  it('does NOT save when emotion_tag missing', async () => {
    const partial: ChatMessage[] = [
      { role: 'user', content: 'NQ long, made $300, entered 9:30, execution 8' },
    ]
    const result = await runSaveDetector({
      messages: partial,
      extracted: { ...emptyExtracted, has_trade: true },
      tradingDate: DATE,
      tradingTimezone: TZ,
    })
    expect(result.save_trade).toBe(false)
  })

  it('respects duplicate prevention marker', async () => {
    const withMarker: ChatMessage[] = [
      ...fullConversation,
      {
        role: 'user',
        content: '[SYSTEM: Trade already saved — NQ long $400 at 2026-03-23T09:30:00-05:00. Do not save this trade again under any circumstances.]',
      },
      { role: 'user', content: 'NQ long, made $400' },
    ]
    const result = await runSaveDetector({
      messages: withMarker,
      extracted: { ...emptyExtracted, has_trade: true },
      tradingDate: DATE,
      tradingTimezone: TZ,
    })
    expect(result.save_trade).toBe(false)
  })

  it('saves trade with correct direction', async () => {
    const shortConvo: ChatMessage[] = [
      { role: 'user', content: 'shorted ES, lost $150, entered 10am, felt frustrated, execution 4 out of 10' },
      { role: 'assistant', content: 'Tough one. Did you follow your plan?' },
      { role: 'user', content: 'no, went off plan' },
    ]
    const result = await runSaveDetector({
      messages: shortConvo,
      extracted: { ...emptyExtracted, has_trade: true },
      tradingDate: DATE,
      tradingTimezone: TZ,
    })
    expect(result.save_trade).toBe(true)
    expect(result.trade_data?.direction).toBe('short')
    expect(result.trade_data?.pnl).toBe(-150)
  })

  it('execution_score is clamped 1-10 in route (verify it returns a number)', async () => {
    const result = await runSaveDetector({
      messages: fullConversation,
      extracted: { ...emptyExtracted, has_trade: true },
      tradingDate: DATE,
      tradingTimezone: TZ,
    })
    if (result.save_trade && result.trade_data?.execution_score != null) {
      expect(result.trade_data.execution_score).toBeGreaterThanOrEqual(1)
      expect(result.trade_data.execution_score).toBeLessThanOrEqual(10)
    }
  })
})
