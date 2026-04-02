// Telegram connect: generate a one-time token for settings page
// GET  → returns { connected: bool, token?: string, bot_link?: string }
// DELETE → disconnects (clears telegram_chat_id)

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'

export async function GET(): Promise<NextResponse> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('users')
      .select('telegram_chat_id')
      .eq('id', user.id)
      .single()

    if (profile?.telegram_chat_id) {
      return NextResponse.json({ connected: true })
    }

    // Generate fresh one-time token
    const token = randomUUID().replace(/-/g, '')
    await supabase
      .from('users')
      .update({ telegram_connect_token: token })
      .eq('id', user.id)

    const botName = process.env.TELEGRAM_BOT_NAME ?? 'tradingbrew_bot'
    return NextResponse.json({
      connected: false,
      token,
      bot_link: `https://t.me/${botName}?start=${token}`,
    })
  } catch (e) {
    console.error('[telegram/connect] GET error:', e)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}

export async function DELETE(): Promise<NextResponse> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    await supabase
      .from('users')
      .update({ telegram_chat_id: null, telegram_connect_token: null })
      .eq('id', user.id)

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[telegram/connect] DELETE error:', e)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
