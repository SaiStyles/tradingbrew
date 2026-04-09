import { describe, it, expect } from 'vitest'
import { runBuddy } from '@/app/api/buddy/agents/buddy'
import type { ContextPacket } from '@/types/trade'

// Minimal context — no trades, no data
const emptyContext: ContextPacket = {
  todaysTrades: [], todaysTradeCount: 0, todaysPnL: 0,
  todayWinRate: 0, todayAvgPnL: 0, weeklyPnL: 0,
  weeklyTradeCount: 0, weeklyWinRate: 0, currentStreak: null,
  active_rules: [], account: null, memories: [],
  upcomingNews: [], dataError: false, historicalQuery: null,
}
const emptyExtracted = {
  instrument: null, direction: null, pnl: null,
  opened_at: null, closed_at: null, position_size: null,
  emotion: null, execution_score: null, followed_plan: null,
  market_condition: null, confirmed: false, declined: false,
  has_trade: false, more_trades: false, exit_reason: null, rr: null, session: null,
  query_type: null, query_subtype: null,
}
const noAnalysis = {
  violations: [], warnings: [], patterns: [], positives: [],
  intervention_needed: false, intervention_type: null,
}
const user = {
  buddy_name: 'Max',
  buddy_personality: 'Friendly Mentor — warm, supportive',
  trading_timezone: 'America/New_York',
}
const baseParams = {
  extracted: emptyExtracted, context: emptyContext,
  analysis: noAnalysis, messages: [],
  tradingDate: '2026-04-01', traderPortrait: '',
  user, model: 'claude-haiku-4-5-20251001' as const,
}

// Phrases that indicate hallucination
const BANNED = [
  "system doesn't support",
  "system does not support",
  "locked to",
  "not able to",
  "unable to",
  "not designed",
  "not built to",
  "can't answer that",
  "cannot answer that",
  "don't have access to",
  "do not have access",
  "outside my",
  "beyond my",
]

function checkHallucination(reply: string) {
  const lower = reply.toLowerCase()
  const found = BANNED.find(b => lower.includes(b))
  if (found) throw new Error(`Hallucinated system limitation: "${found}" in: "${reply}"`)
}

// 10 messages most likely to trigger "system's locked to certain queries"
const TRIGGER_MSGS = [
  "what's the best time to trade NQ?",
  "should I go long or short right now?",
  "can you show me my win rate?",
  "predict what the market will do tomorrow",
  "can you analyze my last 50 trades?",
  "what do the charts say today?",
  "can you pull up my stats from last month?",
  "do you have access to my trade history?",
  "what indicators should I use?",
  "what's my biggest weakness as a trader?",
]

describe('Buddy — no system limitation hallucination', () => {
  for (const msg of TRIGGER_MSGS) {
    it(`does not hallucinate on: "${msg.slice(0, 45)}"`, async () => {
      const reply = await runBuddy({ ...baseParams, message: msg })
      console.log(`[hallucination-test] "${msg.slice(0, 35)}" → ${reply.slice(0, 80)}`)
      expect(reply.trim().length).toBeGreaterThan(0)
      checkHallucination(reply)
    }, 20000)
  }
})
