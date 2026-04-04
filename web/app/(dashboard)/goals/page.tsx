import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import GoalsClient from '@/components/goals/GoalsClient'

function getWeekStart(date: Date): string {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toISOString().split('T')[0]
}

export default async function GoalsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const now = new Date()
  const currentWeekStart = getWeekStart(now)
  const lastWeekDate = new Date(now)
  lastWeekDate.setDate(lastWeekDate.getDate() - 7)
  const lastWeekStart = getWeekStart(lastWeekDate)

  const { data } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', user.id)
    .in('week_start', [currentWeekStart, lastWeekStart])
    .order('created_at', { ascending: true })

  const current = (data ?? []).filter((g: { week_start: string }) => g.week_start === currentWeekStart)
  const last = (data ?? []).filter((g: { week_start: string }) => g.week_start === lastWeekStart)

  return (
    <GoalsClient
      initialCurrent={current}
      initialLast={last}
      currentWeekStart={currentWeekStart}
      lastWeekStart={lastWeekStart}
    />
  )
}
