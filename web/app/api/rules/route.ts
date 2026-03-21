import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import type { Rule } from '@/types/trade'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: rules, error } = await supabase
      .from('rules')
      .select('id, raw_text, is_active, created_at, last_triggered_at')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[GET /api/rules] fetch error:', error)
      return NextResponse.json({ error: 'Failed to fetch rules' }, { status: 500 })
    }

    return NextResponse.json({ rules: rules ?? [] })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    console.error('[GET /api/rules] error:', msg)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body: unknown = await request.json()
    if (typeof body !== 'object' || body === null) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { raw_text } = body as Record<string, unknown>

    if (!raw_text || typeof raw_text !== 'string' || !raw_text.trim()) {
      return NextResponse.json({ error: 'raw_text is required' }, { status: 422 })
    }
    if (raw_text.trim().length > 500) {
      return NextResponse.json({ error: 'raw_text must be 500 characters or less' }, { status: 422 })
    }

    const { data: rule, error } = await supabase
      .from('rules')
      .insert({ user_id: user.id, raw_text: raw_text.trim(), is_active: true })
      .select('id, raw_text, is_active, created_at, last_triggered_at')
      .single()

    if (error) {
      console.error('[POST /api/rules] insert error:', JSON.stringify(error))
      return NextResponse.json({ error: 'Failed to create rule', detail: error.message }, { status: 500 })
    }

    return NextResponse.json({ rule: rule as Rule }, { status: 201 })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    console.error('[POST /api/rules] error:', msg)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
