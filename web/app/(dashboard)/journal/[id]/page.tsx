import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import type { TradeRecord } from '@/types/trade'
import TradeDetailClient from '@/components/journal/TradeDetailClient'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function TradeDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  const [tradeResult, profileResult] = await Promise.all([
    supabase
      .from('trades')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .single(),
    supabase
      .from('users')
      .select('trading_timezone')
      .eq('id', user.id)
      .single(),
  ])

  if (tradeResult.error || !tradeResult.data) {
    notFound()
  }

  const trade = tradeResult.data as TradeRecord
  const tradingTimezone = (profileResult.data?.trading_timezone as string | null) ?? 'America/New_York'

  return <TradeDetailClient trade={trade} tradingTimezone={tradingTimezone} />
}
