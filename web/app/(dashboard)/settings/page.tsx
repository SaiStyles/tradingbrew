import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SettingsClient, { type UserSettings, type Account } from '@/components/settings/SettingsClient'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select(
      'trading_timezone, buddy_name, buddy_personality, buddy_voice_id, notif_morning, notif_news, notif_violations, notif_debrief'
    )
    .eq('id', user.id)
    .single()

  const { data: accounts } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  const initialSettings: UserSettings = {
    trading_timezone: profile?.trading_timezone ?? null,
    buddy_name: profile?.buddy_name ?? null,
    buddy_personality: profile?.buddy_personality ?? null,
    buddy_voice_id: profile?.buddy_voice_id ?? null,
    notif_morning: profile?.notif_morning ?? null,
    notif_news: profile?.notif_news ?? null,
    notif_violations: profile?.notif_violations ?? null,
    notif_debrief: profile?.notif_debrief ?? null,
  }

  return (
    <SettingsClient
      initialSettings={initialSettings}
      initialAccounts={(accounts ?? []) as Account[]}
    />
  )
}
