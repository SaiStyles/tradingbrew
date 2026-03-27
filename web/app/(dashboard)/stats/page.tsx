import { createClient } from '@/lib/supabase/server'
import { StatsClient } from '@/components/stats/StatsClient'

export default async function StatsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: trades } = await supabase
    .from('trades')
    .select('id, pnl, opened_at, instrument, emotion_tag, execution_score, followed_plan, direction')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .not('pnl', 'is', null)
    .order('opened_at', { ascending: true })

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Performance</h1>
        <p className="text-zinc-500 text-sm mt-1">Your edge, in numbers.</p>
      </div>
      <StatsClient trades={trades ?? []} />
    </div>
  )
}
