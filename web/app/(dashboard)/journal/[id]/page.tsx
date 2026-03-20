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

  const { data, error } = await supabase
    .from('trades')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single()

  if (error || !data) {
    notFound()
  }

  const trade = data as TradeRecord

  return <TradeDetailClient trade={trade} />
}
