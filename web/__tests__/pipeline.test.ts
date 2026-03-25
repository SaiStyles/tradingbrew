import { describe, it, expect } from 'vitest'
import { runExtractor } from '@/app/api/buddy/agents/extractor'
import { runAnalyst } from '@/app/api/buddy/agents/analyst'
import { runSaveDetector } from '@/app/api/buddy/agents/save-detector'
import { runScribe } from '@/app/api/buddy/agents/scribe'
import type { ContextPacket, ChatMessage } from '@/types/trade'

const TZ = 'America/New_York'
const DATE = '2026-03-23'

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

/**
 * Full pipeline integration: simulates a complete trade conversation
 * Extractor → Analyst → SaveDetector → Scribe
 */
describe('Pipeline integration (live API)', () => {
  it('runs full pipeline for a complete trade', async () => {
    const userMessage = 'just closed a NQ long, made $600, entered at 9:30am, felt calm, execution was 8 out of 10, followed my plan'

    // Step 1: Extractor
    const extracted = await runExtractor(userMessage, TZ)
    expect(extracted.has_trade).toBe(true)
    expect(extracted.instrument?.toUpperCase()).toBe('NQ')
    expect(extracted.direction).toBe('long')
    expect(extracted.pnl).toBe(600)

    // Step 2: Analyst
    const analyst = await runAnalyst(extracted, emptyContext)
    expect(analyst).toBeDefined()
    expect(Array.isArray(analyst.violations)).toBe(true)
    // Good trade, calm emotion — no intervention
    expect(analyst.intervention_needed).toBe(false)

    // Step 3: SaveDetector (simulated conversation built up)
    const messages: ChatMessage[] = [
      { role: 'user', content: userMessage },
      { role: 'assistant', content: 'Nice trade! 8 out of 10 execution — what made it click today?' },
    ]
    const saveResult = await runSaveDetector({
      messages,
      extracted,
      tradingDate: DATE,
      tradingTimezone: TZ,
    })
    expect(saveResult.save_trade).toBe(true)
    expect(saveResult.trade_data?.instrument).toBeTruthy()

    // Step 4: Scribe (fires post-response)
    const scribeResult = await runScribe({
      message: userMessage,
      buddyReply: 'Nice trade! Execution was solid.',
      extracted,
      context: emptyContext,
      recentMessages: messages,
      existingMemories: [],
      tradingTimezone: TZ,
    })
    expect(scribeResult).toBeDefined()
    expect(typeof scribeResult.should_write).toBe('boolean')
  }, 60000) // Extended timeout for 4 sequential API calls

  it('pipeline handles incomplete trade correctly', async () => {
    const userMessage = 'I took a NQ trade'

    const extracted = await runExtractor(userMessage, TZ)
    expect(extracted.has_trade).toBe(true)
    expect(extracted.instrument?.toUpperCase()).toBe('NQ')
    // No pnl, no emotion, no execution_score

    const messages: ChatMessage[] = [
      { role: 'user', content: userMessage },
      { role: 'assistant', content: 'Got it! How did it go — did you make or lose money?' },
    ]
    const saveResult = await runSaveDetector({
      messages,
      extracted,
      tradingDate: DATE,
      tradingTimezone: TZ,
    })
    // Should NOT save — missing minimum fields
    expect(saveResult.save_trade).toBe(false)
  })

  it('pipeline short-circuits on small talk', async () => {
    const userMessage = 'hey how are you doing'

    const extracted = await runExtractor(userMessage, TZ)
    expect(extracted.has_trade).toBe(false)

    // No need to run analyst or save detector on small talk
    // Verify extractor correctly gates the pipeline
    expect(extracted.instrument).toBeNull()
    expect(extracted.pnl).toBeNull()
  })

  it('analyst flags rule violation that extractor surfaced', async () => {
    const userMessage = 'shorted ES after my 3rd loss, feeling really frustrated, made $200 somehow'

    const extracted = await runExtractor(userMessage, TZ)
    expect(extracted.direction).toBe('short')
    expect(extracted.emotion).toBeTruthy()

    const context: ContextPacket = {
      ...emptyContext,
      active_rules: [
        { id: 'rule-stop-after-3-losses', raw_text: 'Stop trading after 3 consecutive losses' },
        { id: 'rule-no-frustrated', raw_text: 'Do not trade when feeling frustrated' },
      ],
    }
    const analyst = await runAnalyst(extracted, context)
    // At least one of the rules should be flagged
    expect(analyst.violations.length + analyst.warnings.length).toBeGreaterThan(0)
  })
})
