import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

function getWeekStart(date: Date): string {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Monday
  d.setDate(diff)
  return d.toISOString().split('T')[0]
}

// GET /api/goals?week=current|last
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const now = new Date()
    const currentWeekStart = getWeekStart(now)
    const lastWeekDate = new Date(now)
    lastWeekDate.setDate(lastWeekDate.getDate() - 7)
    const lastWeekStart = getWeekStart(lastWeekDate)

    const { data, error } = await supabase
      .from('goals')
      .select('*')
      .eq('user_id', user.id)
      .in('week_start', [currentWeekStart, lastWeekStart])
      .order('created_at', { ascending: true })

    if (error) return NextResponse.json({ error: 'Failed to fetch goals' }, { status: 500 })

    const current = (data ?? []).filter(g => g.week_start === currentWeekStart)
    const last = (data ?? []).filter(g => g.week_start === lastWeekStart)

    return NextResponse.json({ current, last, currentWeekStart, lastWeekStart })
  } catch {
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}

// POST /api/goals — create a new goal
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json() as { goal_text: string; goal_type: string }
    if (!body.goal_text?.trim()) {
      return NextResponse.json({ error: 'goal_text required' }, { status: 400 })
    }

    const weekStart = getWeekStart(new Date())

    const { data, error } = await supabase
      .from('goals')
      .insert({
        user_id: user.id,
        goal_text: body.goal_text.trim(),
        goal_type: body.goal_type ?? 'process',
        week_start: weekStart,
        is_completed: false,
      })
      .select('*')
      .single()

    if (error) return NextResponse.json({ error: 'Failed to create goal' }, { status: 500 })

    return NextResponse.json({ goal: data }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
