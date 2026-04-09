import { createClient } from '@/lib/supabase/server'
import BuddyChat from '@/components/buddy/BuddyChat'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('users')
    .select('name, buddy_name')
    .eq('id', user?.id)
    .single()

  const today = new Date().toISOString().split('T')[0]
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const { data: todayTrades } = await supabase
    .from('trades')
    .select('*')
    .eq('user_id', user?.id)
    .gte('created_at', today)
    .is('deleted_at', null)

  const { data: recentTrades } = await supabase
    .from('trades')
    .select('pnl, opened_at')
    .eq('user_id', user?.id)
    .gte('opened_at', thirtyDaysAgo)
    .is('deleted_at', null)
    .not('pnl', 'is', null)
    .order('opened_at', { ascending: true })

  const todayPnL = todayTrades?.reduce((sum, t) => sum + (t.pnl || 0), 0) || 0
  const tradeCount = todayTrades?.length || 0
  const wins = todayTrades?.filter(t => t.pnl > 0).length || 0
  const winRate = tradeCount > 0 ? Math.round((wins / tradeCount) * 100) : 0

  // Streak: iterate recent trades backwards, count consecutive wins or losses
  let streakCount = 0
  let streakType: 'win' | 'loss' | null = null
  const sorted = recentTrades ?? []
  for (let i = sorted.length - 1; i >= 0; i--) {
    const isWin = (sorted[i].pnl ?? 0) > 0
    if (streakType === null) { streakType = isWin ? 'win' : 'loss'; streakCount = 1 }
    else if ((streakType === 'win') === isWin) streakCount++
    else break
  }
  const streakLabel = streakType === 'win'
    ? `${streakCount}W`
    : streakType === 'loss'
    ? `${streakCount}L`
    : '—'
  const streakColor = streakType === 'win' ? 'text-green-400' : streakType === 'loss' ? 'text-red-400' : 'text-white'

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="p-6 h-screen flex flex-col">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">
          {greeting}, {profile?.name || 'Trader'}
        </h1>
        <p className="text-zinc-500 text-sm mt-1">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: "Today's P&L", value: `$${todayPnL.toFixed(2)}`, color: todayPnL >= 0 ? 'text-green-400' : 'text-red-400' },
          { label: 'Trades Today', value: String(tradeCount), color: 'text-white' },
          { label: 'Win Rate', value: `${winRate}%`, color: 'text-white' },
          { label: 'Streak', value: streakLabel, color: streakColor },
        ].map((stat) => (
          <div key={stat.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-zinc-500 text-xs mb-1">{stat.label}</p>
            <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Buddy Chat — takes remaining space */}
      <div className="flex-1 min-h-0">
        <BuddyChat buddyName={profile?.buddy_name || 'Brew'} />
      </div>
    </div>
  )
}