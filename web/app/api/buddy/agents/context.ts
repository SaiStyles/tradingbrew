import { createClient } from '@/lib/supabase/server'
import type { ContextPacket, TradeRecord, AccountRecord, NewsEvent } from '@/types/trade'
import { getTodayInTz, getISOOffset } from '../timezone'

const EMPTY: ContextPacket = {
  todaysTrades: [],
  todaysPnL: 0,
  todaysTradeCount: 0,
  activeRules: [],
  propFirmAccount: null,
  upcomingNews: [],
  memories: [],
}

export async function runContext(
  userId: string,
  tradingTimezone: string
): Promise<ContextPacket> {
  try {
    const supabase = await createClient()

    // Start of today in trader's timezone as ISO with offset
    const todayDate = getTodayInTz(tradingTimezone)
    const offset = getISOOffset(tradingTimezone)
    const todayStart = `${todayDate}T00:00:00${offset}`
    const twoHoursFromNow = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()

    const [tradesResult, rulesResult, accountResult, newsResult] = await Promise.all([
      supabase
        .from('trades')
        .select('*')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .gte('created_at', todayStart)
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('rules')
        .select('rule_type, value')
        .eq('user_id', userId)
        .eq('is_active', true),
      supabase
        .from('accounts')
        .select('*')
        .eq('user_id', userId)
        .eq('account_type', 'prop')
        .limit(1)
        .maybeSingle(),
      supabase
        .from('news_events')
        .select('*')
        .gte('scheduled_at', new Date().toISOString())
        .lte('scheduled_at', twoHoursFromNow)
        .eq('impact', 'high')
        .order('scheduled_at', { ascending: true }),
    ])

    if (tradesResult.error) console.error('[context] trades fetch error:', tradesResult.error)
    if (rulesResult.error) console.error('[context] rules fetch error:', rulesResult.error)
    if (newsResult.error) console.error('[context] news fetch error:', newsResult.error)

    const trades = (tradesResult.data ?? []) as TradeRecord[]
    const pnl = trades.reduce((sum, t) => sum + (Number(t.pnl) || 0), 0)

    return {
      todaysTrades: trades,
      todaysPnL: pnl,
      todaysTradeCount: trades.length,
      activeRules: (rulesResult.data ?? []) as Array<{ rule_type: string; value: number }>,
      propFirmAccount: (accountResult.data as AccountRecord | null) ?? null,
      upcomingNews: (newsResult.data ?? []) as NewsEvent[],
      memories: [], // Mem0 stub — will be wired when integrated
    }
  } catch (e) {
    console.error('[context] unexpected error:', e)
    return { ...EMPTY }
  }
}
