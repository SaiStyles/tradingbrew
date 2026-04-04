import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import type { TradeRecord } from '@/types/trade'

// Fields that determine the incomplete flag
function calcIncomplete(data: Partial<TradeRecord>): boolean {
  return (
    !data.opened_at ||
    !data.direction ||
    !data.entry_price ||
    !data.exit_price
  )
}

// ------------------------------------------------------------------
// PATCH /api/trades/[id] — partial update
// ------------------------------------------------------------------
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify ownership — only fetch non-deleted trades
    const { data: existing, error: fetchError } = await supabase
      .from('trades')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Trade not found' }, { status: 404 })
    }

    const body: unknown = await request.json()
    if (typeof body !== 'object' || body === null) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const input = body as Partial<TradeRecord>

    // Merge with existing to calculate incomplete flag correctly
    const merged: Partial<TradeRecord> = {
      ...existing,
      ...input,
    }

    const incomplete = calcIncomplete(merged)

    // Build update payload — only include fields explicitly provided
    const updatePayload: Record<string, unknown> = { incomplete }

    const allowedFields: (keyof TradeRecord)[] = [
      'instrument',
      'direction',
      'entry_price',
      'exit_price',
      'stop_loss',
      'pnl',
      'rr',
      'position_size',
      'opened_at',
      'closed_at',
      'emotion_tag',
      'execution_score',
      'notes',
      'followed_plan',
      'session',
      'setup_type',
      'exit_reason',
      'mistakes',
      'market_condition',
    ]

    for (const field of allowedFields) {
      if (field in input) {
        updatePayload[field] = input[field] ?? null
      }
    }

    if (input.instrument && typeof input.instrument === 'string') {
      updatePayload['instrument'] = input.instrument.trim().toUpperCase()
    }

    const { data: updated, error: updateError } = await supabase
      .from('trades')
      .update(updatePayload)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (updateError) {
      console.error('Update trade error:', updateError)
      return NextResponse.json({ error: 'Failed to update trade' }, { status: 500 })
    }

    return NextResponse.json({ trade: updated })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    console.error('PATCH /api/trades/[id] error:', msg)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}

// ------------------------------------------------------------------
// DELETE /api/trades/[id] — soft delete
// ------------------------------------------------------------------
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify ownership
    const { data: existing, error: fetchError } = await supabase
      .from('trades')
      .select('id')
      .eq('id', id)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Trade not found' }, { status: 404 })
    }

    const { error: deleteError } = await supabase
      .from('trades')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id)

    if (deleteError) {
      console.error('Soft delete trade error:', deleteError)
      return NextResponse.json({ error: 'Failed to delete trade' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    console.error('DELETE /api/trades/[id] error:', msg)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
