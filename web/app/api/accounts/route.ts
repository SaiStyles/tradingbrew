import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body: unknown = await request.json()
    if (typeof body !== 'object' || body === null) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const input = body as Record<string, unknown>

    if (!input.nickname || typeof input.nickname !== 'string' || !input.nickname.trim()) {
      return NextResponse.json({ error: 'nickname is required' }, { status: 422 })
    }

    const payload = {
      user_id: user.id,
      account_type: input.account_type ?? 'personal',
      nickname: (input.nickname as string).trim(),
      firm_name: input.firm_name ?? null,
      account_size: input.account_size ?? null,
      current_balance: input.current_balance ?? null,
      daily_loss_limit: input.daily_loss_limit ?? null,
      trailing_drawdown: input.trailing_drawdown ?? null,
      max_trades_day: input.max_trades_day ?? null,
      is_active: true,
    }

    const { data: account, error } = await supabase
      .from('accounts')
      .insert(payload)
      .select()
      .single()

    if (error) {
      console.error('Insert account error:', error)
      return NextResponse.json({ error: 'Failed to create account' }, { status: 500 })
    }

    return NextResponse.json({ account }, { status: 201 })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    console.error('POST /api/accounts error:', msg)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
