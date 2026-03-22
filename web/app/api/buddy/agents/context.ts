import { createClient } from '@/lib/supabase/server'
import type { ContextPacket, TradeRecord, AccountRecord, NewsEvent } from '@/types/trade'
import { getTodayInTz, getISOOffset } from '../timezone'
import { readMemories } from '@/lib/memory/memory'

const EMPTY: ContextPacket = {
  todaysTrades: [],
  todaysPnL: 0,
  todaysTradeCount: 0,
  activeRules: [],
  active_rules: [],
  propFirmAccount: null,
  upcomingNews: [],
  memories: [],
}

export async function runContext(
  userId: string,
  tradingTimezone: string,
  cachedMemories?: string[]
): Promise<ContextPacket> {
  try {
    const supabase = await createClient()

    // Start of today in trader's timezone as ISO with offset
    const todayDate = getTodayInTz(tradingTimezone)
    const offset = getISOOffset(tradingTimezone)
    const todayStart = `${todayDate}T00:00:00${offset}`
    const twoHoursFromNow = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()

    // Use cached memories if available — skip Mem0 round-trip
    const memoriesPromise = cachedMemories !== undefined
      ? Promise.resolve(cachedMemories)
      : readMemories(userId, 'trading patterns behavior psychology emotion')

    const [tradesResult, rulesResult, accountResult, newsResult, memories] = await Promise.all([
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
        .select('id, raw_text')
        .eq('user_id', userId)
        .eq('is_active', true)
        .is('deleted_at', null),
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
      memoriesPromise,
    ])

    if (tradesResult.error) console.error('[context] trades fetch error:', tradesResult.error)
    if (rulesResult.error) console.error('[context] rules fetch error:', rulesResult.error)
    if (newsResult.error) console.error('[context] news fetch error:', newsResult.error)

    const trades = (tradesResult.data ?? []) as TradeRecord[]
    const pnl = trades.reduce((sum, t) => sum + (Number(t.pnl) || 0), 0)

    const rulesData = rulesResult.data ?? []

    return {
      todaysTrades: trades,
      todaysPnL: pnl,
      todaysTradeCount: trades.length,
      activeRules: [],
      active_rules: rulesData
        .filter(r => r.raw_text)
        .map(r => ({ id: r.id as string, raw_text: r.raw_text as string })),
      propFirmAccount: (accountResult.data as AccountRecord | null) ?? null,
      upcomingNews: (newsResult.data ?? []) as NewsEvent[],
      memories,
    }
  } catch (e) {
    console.error('[context] unexpected error:', e)
    return { ...EMPTY }
  }
}
