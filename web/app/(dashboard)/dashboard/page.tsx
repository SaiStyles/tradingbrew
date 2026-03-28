import { createClient } from '@/lib/supabase/server'
import BuddyChat from '@/components/buddy/BuddyChat'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('users')
    .select('name, buddy_name, buddy_voice_id')
    .eq('id', user?.id)
    .single()

  const today = new Date().toISOString().split('T')[0]
  const { data: todayTrades } = await supabase
    .from('trades')
    .select('*')
    .eq('user_id', user?.id)
    .gte('created_at', today)

  const todayPnL = todayTrades?.reduce((sum, t) => sum + (t.pnl || 0), 0) || 0
  const tradeCount = todayTrades?.length || 0
  const wins = todayTrades?.filter(t => t.pnl > 0).length || 0
  const winRate = tradeCount > 0 ? Math.round((wins / tradeCount) * 100) : 0

  return (
    <div className="p-6 h-screen flex flex-col">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">
          Good morning, {profile?.name || 'Trader'} 👋
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
          { label: 'Streak', value: '0 days', color: 'text-white' },
        ].map((stat) => (
          <div key={stat.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-zinc-500 text-xs mb-1">{stat.label}</p>
            <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Buddy Chat — takes remaining space */}
      <div className="flex-1 min-h-0">
        <BuddyChat buddyName={profile?.buddy_name || 'Brew'} buddyVoice={profile?.buddy_voice_id ?? undefined} />
      </div>
    </div>
  )
}