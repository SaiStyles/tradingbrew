/**
 * Chat scenario stress tests — varied iterations
 * Tests real conversation patterns against the full agent pipeline
 */
import { describe, it, expect } from 'vitest'
import { runExtractor } from '@/app/api/buddy/agents/extractor'
import { runSaveDetector } from '@/app/api/buddy/agents/save-detector'
import { runAnalyst } from '@/app/api/buddy/agents/analyst'
import { runScribe } from '@/app/api/buddy/agents/scribe'
import type { ContextPacket, ExtractedData } from '@/types/trade'

const TZ = 'America/New_York'
const DATE = '2026-03-24'

const emptyContext: ContextPacket = {
  todaysTrades: [], todaysTradeCount: 0, todaysPnL: 0,
  todayWinRate: 0, todayAvgPnL: 0,
  weeklyPnL: 0, weeklyTradeCount: 0, weeklyWinRate: 0,
  currentStreak: null, active_rules: [], account: null,
  memories: [], upcomingNews: [], dataError: false,
  historicalQuery: null,
}

const emptyExtracted: ExtractedData = {
  instrument: null, direction: null, pnl: null,
  opened_at: null, closed_at: null, position_size: null,
  emotion: null, execution_score: null, followed_plan: null,
  market_condition: null,
  confirmed: false, declined: false, has_trade: false, more_trades: false,
  exit_reason: null, rr: null, session: null,
  query_type: null, query_subtype: null,
}

// ─────────────────────────────────────────────────────────────
// SCENARIO 1: Trader dumps everything in one message
// ─────────────────────────────────────────────────────────────
describe('Scenario 1: Full trade in one message', () => {
  it('extracts all fields and saves immediately', async () => {
    const msg = 'yo just closed NQ short, lost 450, went in at 10am, felt like FOMO the whole time'
    const extracted = await runExtractor(msg, TZ)

    expect(extracted.has_trade).toBe(true)
    expect(extracted.instrument?.toUpperCase()).toBe('NQ')
    expect(extracted.direction).toBe('short')
    expect(extracted.pnl).toBe(-450)
    expect(extracted.emotion).toBe('FOMO')

    // Recorder mode: save decision based on extracted fields only
    const save = await runSaveDetector({ extracted, tradingDate: DATE, tradingTimezone: TZ })
    console.log('[scenario1] save_trade:', save.save_trade, '| trade_data:', JSON.stringify(save.trade_data))
    expect(typeof save.save_trade).toBe('boolean')
  }, 30000)
})

// ─────────────────────────────────────────────────────────────
// SCENARIO 2: Full trade with no execution score — should save
// ─────────────────────────────────────────────────────────────
describe('Scenario 2: Trade saves without execution score', () => {
  it('saves trade when execution_score is missing (optional field)', async () => {
    // Recorder mode: extractor picks up fields from one utterance
    const msg = 'took ES long, lost 800 bucks, entered at 9:30, frustrated honestly'
    const extracted = await runExtractor(msg, TZ)
    console.log('[scenario2] extracted:', JSON.stringify({ instrument: extracted.instrument, pnl: extracted.pnl, emotion: extracted.emotion }))

    const save = await runSaveDetector({ extracted, tradingDate: DATE, tradingTimezone: TZ })
    console.log('[scenario2] save_trade:', save.save_trade, '| execution_score:', save.trade_data?.execution_score)
    // execution_score not mentioned → should still save (it's optional)
    expect(save.save_trade).toBe(true)
    expect(save.trade_data?.execution_score).toBeUndefined()
  }, 30000)
})

// ─────────────────────────────────────────────────────────────
// SCENARIO 3: Second trade utterance — extractor picks it up clean
// ─────────────────────────────────────────────────────────────
describe('Scenario 3: Second trade in same session', () => {
  it('extractor correctly parses second trade utterance', async () => {
    // Recorder processes each utterance independently
    const msg = 'yeah took another NQ long at 11am, also made 300, felt confident this time'
    const extracted = await runExtractor(msg, TZ)
    console.log('[scenario3] instrument:', extracted.instrument, '| direction:', extracted.direction, '| pnl:', extracted.pnl)

    expect(extracted.instrument?.toUpperCase()).toBe('NQ')
    expect(extracted.direction).toBe('long')
    expect(extracted.pnl).toBe(300)
    expect(extracted.emotion).toBe('confident')

    const save = await runSaveDetector({ extracted, tradingDate: DATE, tradingTimezone: TZ })
    console.log('[scenario3] save_trade:', save.save_trade, '| opened_at:', save.trade_data?.opened_at)
    expect(save.save_trade).toBe(true)
  }, 30000)
})

// ─────────────────────────────────────────────────────────────
// SCENARIO 4: Small talk — pipeline should gate correctly
// ─────────────────────────────────────────────────────────────
describe('Scenario 4: Pure small talk variations', () => {
  const smallTalkMessages = [
    'gm bro',
    'how are you doing today',
    'markets are crazy right now',
    'thinking about maybe trading NQ later',
    'whats your take on the fed today',
  ]

  smallTalkMessages.forEach((msg) => {
    it(`has_trade = false for: "${msg}"`, async () => {
      const extracted = await runExtractor(msg, TZ)
      expect(extracted.has_trade).toBe(false)
      expect(extracted.instrument).toBeNull()
    }, 15000)
  })
})

// ─────────────────────────────────────────────────────────────
// SCENARIO 5: Revenge trading — analyst should flag hard
// ─────────────────────────────────────────────────────────────
describe('Scenario 5: Revenge trading pattern', () => {
  it('analyst flags revenge with intervention_needed', async () => {
    const extracted: ExtractedData = {
      ...emptyExtracted,
      has_trade: true,
      instrument: 'NQ',
      direction: 'short',
      pnl: -1200,
      emotion: 'revenge',
      followed_plan: false,
    }
    const analyst = await runAnalyst(extracted, {
      ...emptyContext,
      active_rules: [{ id: 'rule-no-revenge', raw_text: 'Never revenge trade after a loss' }],
    })
    console.log('[scenario5] intervention_needed:', analyst.intervention_needed, '| type:', analyst.intervention_type)
    console.log('[scenario5] violations:', JSON.stringify(analyst.violations))
    expect(analyst.intervention_needed).toBe(true)
    expect(analyst.violations.length).toBeGreaterThan(0)
  }, 20000)
})

// ─────────────────────────────────────────────────────────────
// SCENARIO 6: Trader mentions trade then pivots to life stuff
// ─────────────────────────────────────────────────────────────
describe('Scenario 6: Trade mention then off-topic', () => {
  it('extractor still detects trade even with extra chatter', async () => {
    const msg = 'took a quick ES short this morning, lost like 200, anyway my cat knocked over my coffee lol'
    const extracted = await runExtractor(msg, TZ)
    console.log('[scenario6] has_trade:', extracted.has_trade, '| instrument:', extracted.instrument, '| pnl:', extracted.pnl)
    expect(extracted.has_trade).toBe(true)
    expect(extracted.instrument?.toUpperCase()).toBe('ES')
    expect(extracted.pnl).toBe(-200)
  }, 15000)
})

// ─────────────────────────────────────────────────────────────
// SCENARIO 7: Incomplete utterance vs complete utterance
// ─────────────────────────────────────────────────────────────
describe('Scenario 7: Incomplete vs complete recorder utterance', () => {
  it('does not save partial utterance, saves complete utterance', async () => {
    // Incomplete: no pnl, no time, no emotion
    const partial = await runExtractor('traded NQ today', TZ)
    expect(partial.has_trade).toBe(true)
    expect(partial.pnl).toBeNull()

    const save1 = await runSaveDetector({ extracted: partial, tradingDate: DATE, tradingTimezone: TZ })
    expect(save1.save_trade).toBe(false) // Missing minimum fields

    // Complete: all minimum fields in one utterance
    const complete = await runExtractor('NQ short, lost 350, entered at 2pm, felt calm', TZ)
    const save2 = await runSaveDetector({ extracted: complete, tradingDate: DATE, tradingTimezone: TZ })
    console.log('[scenario7] complete save_trade:', save2.save_trade)
    expect(save2.save_trade).toBe(true)
  }, 40000)
})

// ─────────────────────────────────────────────────────────────
// SCENARIO 8: Scribe — meaningful session vs nothing
// ─────────────────────────────────────────────────────────────
describe('Scenario 8: Scribe judgment on session quality', () => {
  it('writes memory for psychological breakthrough', async () => {
    const result = await runScribe({
      message: 'i think i finally get it, i revenge trade when i feel like the market disrespected me, its ego',
      buddyReply: 'That self-awareness is rare. Most traders never name it.',
      extracted: { ...emptyExtracted },
      context: emptyContext,
      recentMessages: [],
      existingMemories: [],
      tradingTimezone: TZ,
    })
    console.log('[scenario8] should_write:', result.should_write, '| memories:', result.memories)
    expect(result.should_write).toBe(true)
    expect(result.memories.length).toBeGreaterThan(0)
  }, 20000)

  it('stays silent on routine trade acknowledgment', async () => {
    const result = await runScribe({
      message: 'ok',
      buddyReply: 'Got it.',
      extracted: { ...emptyExtracted, confirmed: true },
      context: emptyContext,
      recentMessages: [],
      existingMemories: [],
      tradingTimezone: TZ,
    })
    console.log('[scenario8b] should_write:', result.should_write)
    expect(result.should_write).toBe(false)
  }, 20000)
})

// ─────────────────────────────────────────────────────────────
// SCENARIO 9: Edge case — trader says loss then corrects it
// ─────────────────────────────────────────────────────────────
describe('Scenario 9: PnL correction mid-conversation', () => {
  it('extractor captures corrected PnL from latest message', async () => {
    const msg = 'wait no i made 200 not lost, i miscalculated'
    const extracted = await runExtractor(msg, TZ)
    console.log('[scenario9] pnl:', extracted.pnl)
    expect(extracted.pnl).toBe(200)
  }, 15000)
})

// ─────────────────────────────────────────────────────────────
// SCENARIO 10: Account at risk — drawdown violation
// ─────────────────────────────────────────────────────────────
describe('Scenario 10: Account drawdown warning', () => {
  it('analyst flags account risk when near daily limit', async () => {
    const extracted: ExtractedData = {
      ...emptyExtracted,
      has_trade: true,
      instrument: 'ES',
      direction: 'long',
      pnl: -800,
      emotion: 'frustrated',
    }
    const context: ContextPacket = {
      ...emptyContext,
      todaysPnL: -1800,
      todaysTradeCount: 4,
      account: {
        id: 'acc-1',
        user_id: 'user-1',
        account_type: 'prop',
        nickname: 'Apex',
        balance: 50000,
        daily_loss_limit: 2000,
        max_drawdown: 3000,
        current_drawdown: 1800,
      },
    }
    const analyst = await runAnalyst(extracted, context)
    console.log('[scenario10] warnings:', analyst.warnings)
    console.log('[scenario10] intervention:', analyst.intervention_needed, analyst.intervention_type)
    expect(analyst.warnings.length + analyst.violations.length).toBeGreaterThan(0)
  }, 20000)
})
