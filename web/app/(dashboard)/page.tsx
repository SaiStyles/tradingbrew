import { createClient } from '@/lib/supabase/server'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', user?.id)
    .single()

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">
          Good morning, {profile?.name || 'Trader'} 👋
        </h1>
        <p className="text-zinc-400 mt-1 text-sm">
          {profile?.buddy_name || 'Brew'} is ready when you are.
        </p>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: "Today's P&L", value: '$0.00' },
          { label: 'Trades Today', value: '0' },
          { label: 'Win Rate', value: '0%' },
          { label: 'Streak', value: '0 days' },
        ].map((stat) => (
          <div key={stat.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-zinc-500 text-xs mb-1">{stat.label}</p>
            <p className="text-xl font-bold text-white">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <p className="text-zinc-400 text-sm">
          🎙️ Buddy chat coming soon...
        </p>
      </div>
    </div>
  )
}