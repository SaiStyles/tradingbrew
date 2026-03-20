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

  try {
    const { data, count, error } = await supabase
      .from('trades')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(0, 19)

    if (error) {
      console.error('Journal page fetch error:', error)
    } else {
      initialTrades = (data ?? []) as TradeRecord[]
      initialTotal = count ?? 0
    }
  } catch (err) {
    console.error('Journal page unexpected error:', err)
  }

  return (
    <JournalClient
      initialTrades={initialTrades}
      initialTotal={initialTotal}
    />
  )
}
