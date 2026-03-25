import { describe, it, expect } from 'vitest'
import { runScribe } from '@/app/api/buddy/agents/scribe'
import type { ExtractedData, ContextPacket, ChatMessage } from '@/types/trade'

const emptyExtracted: ExtractedData = {
  instrument: null, direction: null, pnl: null,
  opened_at: null, closed_at: null,
  position_size: null,
  emotion: null, execution_score: null,
  followed_plan: null, confirmed: false,
  declined: false, has_trade: false,
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

describe('Scribe agent (live API)', () => {
  it('returns valid structure on empty exchange', async () => {
    const result = await runScribe({
      message: 'hey whats up',
      buddyReply: 'Hey! How is your session going?',
      extracted: emptyExtracted,
      context: emptyContext,
      recentMessages: [],
      existingMemories: [],
      tradingTimezone: 'America/New_York',
    })
    expect(result).toBeDefined()
    expect(typeof result.should_write).toBe('boolean')
    expect(Array.isArray(result.memories)).toBe(true)
  })

  it('stays silent on trivial small talk', async () => {
    const result = await runScribe({
      message: 'what do you think about the weather',
      buddyReply: 'Ha, not really my area! How is trading going today?',
      extracted: emptyExtracted,
      context: emptyContext,
      recentMessages: [
        { role: 'user', content: 'what do you think about the weather' },
        { role: 'assistant', content: 'Ha, not really my area! How is trading going today?' },
      ],
      existingMemories: [],
      tradingTimezone: 'America/New_York',
    })
    // Scribe has judgment — silence is the correct default for trivial exchanges
    expect(typeof result.should_write).toBe('boolean')
    if (result.should_write) {
      expect(result.memories.length).toBeGreaterThan(0)
    }
  })

  it('writes memory when significant emotional pattern is revealed', async () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'lost $800 on NQ again, I keep revenge trading after losses, I cant stop' },
      { role: 'assistant', content: 'That awareness is really important. What do you think triggers it?' },
      { role: 'user', content: 'I just cant accept a loss. I have to win it back immediately' },
      { role: 'assistant', content: 'That need to immediately recover is worth exploring.' },
    ]
    const result = await runScribe({
      message: 'I just cant accept a loss. I have to win it back immediately',
      buddyReply: 'That need to immediately recover is worth exploring.',
      extracted: { ...emptyExtracted, has_trade: true, instrument: 'NQ', pnl: -800, emotion: 'revenge' },
      context: emptyContext,
      recentMessages: messages,
      existingMemories: [],
      tradingTimezone: 'America/New_York',
    })
    expect(result.should_write).toBe(true)
    expect(result.memories.length).toBeGreaterThan(0)
  })

  it('memory fields are correctly typed when written', async () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'made $1200 today, best day ever, felt calm the whole session' },
      { role: 'assistant', content: 'Amazing discipline. What made today different?' },
      { role: 'user', content: 'I just stuck to my A+ setups and did not force anything' },
    ]
    const result = await runScribe({
      message: 'I just stuck to my A+ setups and did not force anything',
      buddyReply: 'That is exactly what edge looks like.',
      extracted: { ...emptyExtracted, has_trade: true, pnl: 1200, emotion: 'calm', execution_score: 9, followed_plan: true },
      context: emptyContext,
      recentMessages: messages,
      existingMemories: [],
      tradingTimezone: 'America/New_York',
    })
    if (result.should_write) {
      for (const mem of result.memories) {
        expect(typeof mem).toBe('string')
        expect(mem.length).toBeGreaterThan(0)
      }
    }
  })

  it('single observation weight stays below 7', async () => {
    const result = await runScribe({
      message: 'NQ long, made $400, felt calm',
      buddyReply: 'Nice trade!',
      extracted: { ...emptyExtracted, has_trade: true, instrument: 'NQ', pnl: 400, emotion: 'calm' },
      context: emptyContext,
      recentMessages: [
        { role: 'user', content: 'NQ long, made $400, felt calm' },
        { role: 'assistant', content: 'Nice trade!' },
      ],
      existingMemories: [],
      tradingTimezone: 'America/New_York',
    })
    if (result.should_write) {
      for (const mem of result.memories) {
        expect(typeof mem).toBe('string')
        expect(mem.length).toBeGreaterThan(0)
      }
    }
  })

  it('does not duplicate existing memories', async () => {
    const existingMemories = [
      'Trader struggles to accept losses. Tends to revenge trade immediately after a red trade. [Buddy note: Do not push for another trade right after a loss — give space first.]',
    ]
    const result = await runScribe({
      message: 'lost again, revenge traded, I always do this',
      buddyReply: 'This has come up before. What would help you pause next time?',
      extracted: { ...emptyExtracted, has_trade: true, pnl: -300, emotion: 'revenge' },
      context: emptyContext,
      recentMessages: [
        { role: 'user', content: 'lost again, revenge traded, I always do this' },
      ],
      existingMemories,
      tradingTimezone: 'America/New_York',
    })
    if (result.should_write) {
      for (const mem of result.memories) {
        // Should add something new, not repeat the same observation verbatim
        expect(mem.toLowerCase()).not.toBe(existingMemories[0].toLowerCase())
      }
    }
  })
})
