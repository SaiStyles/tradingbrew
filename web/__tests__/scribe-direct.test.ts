import { describe, it } from 'vitest'
import { runScribe } from '../app/api/buddy/agents/scribe'
import type { ContextPacket, ChatMessage } from '@/types/trade'

const BASE_CONTEXT: ContextPacket = {
  todaysTrades: [],
  todaysTradeCount: 0,
  todaysPnL: 0,
  weeklyPnL: 0,
  weeklyTradeCount: 0,
  weeklyWinRate: 0,
  todayWinRate: 0,
  todayAvgPnL: 0,
  currentStreak: { type: 'neutral', count: 0 },
  activeRules: [],
  accountInfo: null,
  upcomingEvents: [],
  hindsightMemories: [],
  dataError: false,
}

describe('Scribe — direct output tests', () => {
  it('scenario 1: Discord peer pressure tilt — two losses in a row, broke promise', async () => {
    const result = await runScribe({
      message: "i couldnt because there was peer pressure man, the discord people they made profit not me",
      buddyReply: "That's the worst feeling, watching everyone else print while you're in the red. But trading their calls when you're already tilted — that's how small losses turn into big ones. Step away from the chat for a bit?",
      extracted: {
        instrument: 'ES', direction: 'long', pnl: -180,
        opened_at: '2026-03-24T14:30:00-04:00', closed_at: '2026-03-24T14:48:00-04:00',
        position_size: null, emotion: 'FOMO', execution_score: null,
        followed_plan: false, confirmed: false, declined: false, has_trade: true,
      },
      context: {
        ...BASE_CONTEXT,
        todaysTrades: [
          { instrument: 'ES', direction: 'long', pnl: -200, execution_score: null, emotion_tag: 'FOMO', opened_at: '2026-03-24T13:55:00-04:00', closed_at: '2026-03-24T14:12:00-04:00' },
          { instrument: 'ES', direction: 'long', pnl: -180, execution_score: null, emotion_tag: 'FOMO', opened_at: '2026-03-24T14:30:00-04:00', closed_at: '2026-03-24T14:48:00-04:00' },
        ] as any,
        todaysTradeCount: 2,
        todaysPnL: -380,
        weeklyPnL: 620,
        weeklyWinRate: 0.625,
        currentStreak: { type: 'loss', count: 2 },
      },
      recentMessages: [
        { role: 'user', content: 'ye kinda yk messed around', timestamp: new Date().toISOString() },
        { role: 'assistant', content: "Hey, real talk — what was going through your head?", timestamp: new Date().toISOString() },
        { role: 'user', content: 'it was fine since im already green whole week', timestamp: new Date().toISOString() },
        { role: 'assistant', content: "Yeah you've been running it this week. But that's not the same thing as today being cool to just throw at it.", timestamp: new Date().toISOString() },
        { role: 'user', content: 'ye i know mb bro, wont repeat', timestamp: new Date().toISOString() },
        { role: 'assistant', content: "That's all I need to hear.", timestamp: new Date().toISOString() },
        { role: 'user', content: 'took another loss bro, i tilted', timestamp: new Date().toISOString() },
        { role: 'assistant', content: "Hey — you said you wouldn't repeat it like two minutes ago. What's going on today man?", timestamp: new Date().toISOString() },
      ] as ChatMessage[],
      existingMemories: [],
    })

    console.log('\n=== SCENARIO 1: Discord tilt ===')
    console.log(JSON.stringify(result, null, 2))
  }, 30000)

  it('scenario 2: casual gm — should write nothing', async () => {
    const result = await runScribe({
      message: "yo gm bro",
      buddyReply: "yo gm, what's good?",
      extracted: null,
      context: BASE_CONTEXT,
      recentMessages: [],
      existingMemories: [],
    })

    console.log('\n=== SCENARIO 2: small talk (expect nothing) ===')
    console.log(JSON.stringify(result, null, 2))
  }, 30000)

  it('scenario 3: breakthrough — trader admits impulsive trade without defending it', async () => {
    const result = await runScribe({
      message: "ye honestly that was dumb, i knew i shouldnt have entered, i just did it anyway, no reason",
      buddyReply: "that kind of honesty is rare. most people would've found a reason. you good?",
      extracted: {
        instrument: 'NQ', direction: 'long', pnl: -320,
        opened_at: '2026-03-24T10:15:00-04:00', closed_at: '2026-03-24T10:34:00-04:00',
        position_size: null, emotion: 'FOMO', execution_score: 3,
        followed_plan: false, confirmed: false, declined: false, has_trade: true,
      },
      context: {
        ...BASE_CONTEXT,
        todaysTradeCount: 1,
        todaysPnL: -320,
        weeklyPnL: 450,
        weeklyWinRate: 0.6,
        currentStreak: { type: 'loss', count: 1 },
      },
      recentMessages: [] as ChatMessage[],
      existingMemories: [],
    })

    console.log('\n=== SCENARIO 3: breakthrough moment ===')
    console.log(JSON.stringify(result, null, 2))
  }, 30000)

  it('scenario 4: weekly green justification — rationalization pattern', async () => {
    const result = await runScribe({
      message: "its fine i can take this loss, im up big this week anyway",
      buddyReply: "yeah the week's been solid. but that logic can get expensive if today keeps going. you closing this or riding it?",
      extracted: {
        instrument: 'NQ', direction: 'short', pnl: -450,
        opened_at: '2026-03-24T09:30:00-04:00', closed_at: null,
        position_size: null, emotion: 'FOMO', execution_score: null,
        followed_plan: null, confirmed: false, declined: false, has_trade: true,
      },
      context: {
        ...BASE_CONTEXT,
        todaysTradeCount: 1,
        todaysPnL: -450,
        weeklyPnL: 1200,
        weeklyWinRate: 0.7,
        currentStreak: { type: 'loss', count: 1 },
      },
      recentMessages: [] as ChatMessage[],
      existingMemories: [],
    })

    console.log('\n=== SCENARIO 4: weekly green rationalization ===')
    console.log(JSON.stringify(result, null, 2))
  }, 30000)
})
