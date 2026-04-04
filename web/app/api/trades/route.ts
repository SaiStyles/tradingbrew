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
// POST /api/trades — create a trade
// ------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body: unknown = await request.json()
    if (typeof body !== 'object' || body === null) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const input = body as Partial<TradeRecord>

    // Validate required field
    if (!input.instrument || typeof input.instrument !== 'string' || !input.instrument.trim()) {
      return NextResponse.json({ error: 'instrument is required' }, { status: 422 })
    }

    const incomplete = calcIncomplete(input)

    const payload = {
      user_id: user.id,
      instrument: input.instrument.trim().toUpperCase(),
      direction: input.direction ?? null,
      entry_price: input.entry_price ?? null,
      exit_price: input.exit_price ?? null,
      stop_loss: input.stop_loss ?? null,
      pnl: input.pnl ?? null,
      rr: input.rr ?? null,
      position_size: input.position_size ?? null,
      opened_at: input.opened_at ?? null,
      closed_at: input.closed_at ?? null,
      emotion_tag: input.emotion_tag ?? null,
      execution_score: input.execution_score ?? null,
      notes: input.notes ?? null,
      followed_plan: input.followed_plan ?? null,
      session: input.session ?? null,
      setup_type: input.setup_type ?? null,
      exit_reason: input.exit_reason ?? null,
      mistakes: input.mistakes ?? [],
      market_condition: input.market_condition ?? null,
      incomplete,
      deleted_at: null,
    }

    const { data: trade, error } = await supabase
      .from('trades')
      .insert(payload)
      .select()
      .single()

    if (error) {
      console.error('Insert trade error:', error)
      return NextResponse.json({ error: 'Failed to save trade' }, { status: 500 })
    }

    return NextResponse.json({ trade }, { status: 201 })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    console.error('POST /api/trades error:', msg)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}

// ------------------------------------------------------------------
// GET /api/trades — list trades
// ------------------------------------------------------------------
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const instrument = searchParams.get('instrument')
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 100)
    const offset = parseInt(searchParams.get('offset') ?? '0', 10)
    const includeIncomplete = searchParams.get('include_incomplete') === 'true'
    const direction = searchParams.get('direction') as 'long' | 'short' | null

    let query = supabase
      .from('trades')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('opened_at', { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1)

    if (instrument) {
      query = query.ilike('instrument', `%${instrument}%`)
    }
    if (from) {
      query = query.gte('opened_at', from)
    }
    if (to) {
      query = query.lte('opened_at', to + 'T23:59:59.999Z')
    }
    if (direction && (direction === 'long' || direction === 'short')) {
      query = query.eq('direction', direction)
    }
    if (!includeIncomplete) {
      // By default show all trades (complete and incomplete)
      // Only filter them out if explicitly requested
    }

    const { data: trades, count, error } = await query

    if (error) {
      console.error('Fetch trades error:', error)
      return NextResponse.json({ error: 'Failed to fetch trades' }, { status: 500 })
    }

    return NextResponse.json({ trades: trades ?? [], total: count ?? 0 })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    console.error('GET /api/trades error:', msg)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
