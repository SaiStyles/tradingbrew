import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import JournalClient from '@/components/journal/JournalClient'
import type { TradeRecord } from '@/types/trade'

export default async function JournalPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Server-side initial data fetch
  let initialTrades: TradeRecord[] = []
  let initialTotal = 0
  let tradingTimezone = 'America/New_York'

  try {
    const [tradesResult, profileResult] = await Promise.all([
      supabase
        .from('trades')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .order('opened_at', { ascending: false, nullsFirst: true })
        .range(0, 49),
      supabase
        .from('users')
        .select('trading_timezone')
        .eq('id', user.id)
        .single(),
    ])

    if (tradesResult.error) {
      console.error('Journal page fetch error:', tradesResult.error)
    } else {
      initialTrades = (tradesResult.data ?? []) as TradeRecord[]
      initialTotal = tradesResult.count ?? 0
    }

    if (profileResult.data?.trading_timezone) {
      tradingTimezone = profileResult.data.trading_timezone as string
    }
  } catch (err) {
    console.error('Journal page unexpected error:', err)
  }

  return (
    <JournalClient
      initialTrades={initialTrades}
      initialTotal={initialTotal}
      tradingTimezone={tradingTimezone}
    />
  )
}
