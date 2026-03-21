import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    await supabase
      .schema('public')
      .from('sessions')
      .update({ violation_count: 0 })
      .eq('user_id', user.id)
      .order('started_at', { ascending: false })
      .limit(1)

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    console.error('[POST /api/rules/clear-badge] error:', msg)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
