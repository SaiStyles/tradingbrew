import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body: unknown = await request.json()
    if (typeof body !== 'object' || body === null) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { is_active } = body as Record<string, unknown>
    if (typeof is_active !== 'boolean') {
      return NextResponse.json({ error: 'is_active must be a boolean' }, { status: 422 })
    }

    const { data: rule, error } = await supabase
      .from('rules')
      .update({ is_active })
      .eq('id', id)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .select('id, raw_text, is_active, created_at, last_triggered_at')
      .single()

    if (error) {
      console.error('[PATCH /api/rules/[id]] error:', error)
      return NextResponse.json({ error: 'Failed to update rule' }, { status: 500 })
    }

    return NextResponse.json({ rule })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    console.error('[PATCH /api/rules/[id]] error:', msg)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { error } = await supabase
      .from('rules')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      console.error('[DELETE /api/rules/[id]] error:', error)
      return NextResponse.json({ error: 'Failed to delete rule' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    console.error('[DELETE /api/rules/[id]] error:', msg)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
