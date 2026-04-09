import { createClient } from '@/lib/supabase/server'
import { recallMemories } from '@/lib/memory/hindsight'
import type { ContextPacket, TradeRecord, AccountRecord, NewsEvent } from '@/types/trade'
import { getTodayInTz, getISOOffset } from '../timezone'

const EMPTY: ContextPacket = {
  todaysTrades: [],
  todaysPnL: 0,
  todaysTradeCount: 0,
  todayWinRate: 0,
  todayAvgPnL: 0,
  weeklyPnL: 0,
  weeklyTradeCount: 0,
  weeklyWinRate: 0,
  currentStreak: null,
  active_rules: [],
  account: null,
  upcomingNews: [],
  memories: [],
  dataError: false,
  historicalQuery: null,
}

function computeStreak(trades: TradeRecord[]): { type: 'win' | 'loss'; count: number } | null {
  if (trades.length === 0) return null

  // Group by date (YYYY-MM-DD from created_at)
  const byDay = new Map<string, number>()
  for (const t of trades) {
    const day = t.created_at.slice(0, 10)
    byDay.set(day, (byDay.get(day) ?? 0) + (Number(t.pnl) || 0))
  }

  // Sort days descending (most recent first)
  const days = Array.from(byDay.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  if (days.length < 2) return null

  // Find streak type from most recent day
  const firstPnl = days[0][1]
  if (firstPnl === 0) return null
  const streakType = firstPnl > 0 ? 'win' : 'loss'

  let count = 0
  for (const [, pnl] of days) {
    if (pnl === 0) break
    const dayType = pnl > 0 ? 'win' : 'loss'
    if (dayType !== streakType) break
    count++
  }

  return count >= 2 ? { type: streakType, count } : null
}

export async function runContext(
  userId: string,
  tradingTimezone: string,
  message: string,
): Promise<ContextPacket> {
  try {
    const supabase = await createClient()

    const todayDate = getTodayInTz(tradingTimezone)
    const offset = getISOOffset(tradingTimezone)
    const todayStart = `${todayDate}T00:00:00${offset}`
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const twoHoursFromNow = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()

    const fetchAll = Promise.all([
      supabase
        .from('trades')
        .select('instrument, direction, pnl, execution_score, emotion_tag, followed_plan, session, exit_reason, mistakes, opened_at, closed_at, created_at')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .gte('created_at', todayStart)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('trades')
        .select('instrument, direction, pnl, execution_score, emotion_tag, followed_plan, session, exit_reason, mistakes, opened_at, closed_at, created_at')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .gte('opened_at', sevenDaysAgo)
        .lt('opened_at', todayStart)
        .order('opened_at', { ascending: false })
        .limit(100),
      supabase
        .from('rules')
        .select('id, raw_text')
        .eq('user_id', userId)
        .eq('is_active', true)
        .is('deleted_at', null),
      supabase
        .from('accounts')
        .select('*')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle(),
      supabase
        .from('news_events')
        .select('*')
        .gte('scheduled_at', new Date().toISOString())
        .lte('scheduled_at', twoHoursFromNow)
        .eq('impact', 'high')
        .order('scheduled_at', { ascending: true }),
      recallMemories(userId, message),
    ])

    const timedOut = new Promise<null>(resolve => setTimeout(() => resolve(null), 5000))
    const result = await Promise.race([fetchAll, timedOut])

    if (!result) {
      console.error('[context] timeout — returning empty with dataError')
      return { ...EMPTY, dataError: true }
    }

    const [tradesResult, prevTradesResult, rulesResult, accountResult, newsResult, memories] = result

    let dataError = false
    if (tradesResult.error) { console.error('[context] today trades error:', tradesResult.error); dataError = true }
    if (rulesResult.error) { console.error('[context] rules error:', rulesResult.error); dataError = true }
    if (newsResult.error) { console.error('[context] news error:', newsResult.error); dataError = true }

    const todayTrades = (tradesResult.data ?? []) as TradeRecord[]
    const prevTrades = (prevTradesResult.data ?? []) as TradeRecord[]
    const allWeekTrades = [...todayTrades, ...prevTrades]

    // Today stats
    const todayPnL = todayTrades.reduce((s, t) => s + (Number(t.pnl) || 0), 0)
    const todayWins = todayTrades.filter(t => (Number(t.pnl) || 0) > 0).length
    const todayWinRate = todayTrades.length > 0 ? Math.round((todayWins / todayTrades.length) * 100) : 0
    const todayAvgPnL = todayTrades.length > 0 ? todayPnL / todayTrades.length : 0

    // Weekly stats
    const weeklyPnL = allWeekTrades.reduce((s, t) => s + (Number(t.pnl) || 0), 0)
    const weeklyWins = allWeekTrades.filter(t => (Number(t.pnl) || 0) > 0).length
    const weeklyWinRate = allWeekTrades.length > 0 ? Math.round((weeklyWins / allWeekTrades.length) * 100) : 0

    return {
      todaysTrades: todayTrades,
      todaysPnL: todayPnL,
      todaysTradeCount: todayTrades.length,
      todayWinRate,
      todayAvgPnL,
      weeklyPnL,
      weeklyTradeCount: allWeekTrades.length,
      weeklyWinRate,
      currentStreak: computeStreak(allWeekTrades),
      active_rules: (rulesResult.data ?? [])
        .filter(r => r.raw_text)
        .map(r => ({ id: r.id as string, raw_text: r.raw_text as string })),
      account: (accountResult.data as AccountRecord | null) ?? null,
      upcomingNews: (newsResult.data ?? []) as NewsEvent[],
      memories,
      dataError,
      historicalQuery: null,
    }
  } catch (e) {
    console.error('[context] unexpected error:', e)
    return { ...EMPTY, dataError: true }
  }
}
