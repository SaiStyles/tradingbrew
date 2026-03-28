import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select(
        'trading_timezone, buddy_name, buddy_personality, buddy_voice_id, notif_morning, notif_news, notif_violations, notif_debrief'
      )
      .eq('id', user.id)
      .single()

    if (profileError) {
      console.error('Fetch settings error:', profileError)
      return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 })
    }

    const { data: accounts } = await supabase
      .from('accounts')
      .select('*')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    return NextResponse.json({ settings: profile, accounts: accounts ?? [] })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    console.error('GET /api/settings error:', msg)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body: unknown = await request.json()
    if (typeof body !== 'object' || body === null) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const input = body as Record<string, unknown>
    const allowed = ['trading_timezone', 'buddy_name', 'buddy_personality', 'buddy_voice_id', 'notif_morning', 'notif_news', 'notif_violations', 'notif_debrief']
    const update: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in input) update[key] = input[key]
    }
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('users')
      .update(update)
      .eq('id', user.id)
      .select()
      .single()

    if (error) {
      console.error('Update settings error:', error)
      return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
    }

    return NextResponse.json({ settings: data })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    console.error('PATCH /api/settings error:', msg)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
