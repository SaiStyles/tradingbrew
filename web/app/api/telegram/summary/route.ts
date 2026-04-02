// Sends end-of-session summary to user's Telegram chat.
// POST (no body needed) — reads today's trades from Supabase, formats, sends.
// Returns { sent: bool, reason?: string }

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { TradeRecord } from '@/types/trade'

async function sendMessage(chatId: string, text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return false

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  })
  return res.ok
}

function formatSummary(
  trades: TradeRecord[],
  buddyName: string,
  date: string
): string {
  const completed = trades.filter((t) => !t.incomplete)
  if (completed.length === 0) {
    return `🎙️ <b>Session — ${date}</b>\n\nNo completed trades logged today.\n\n<i>— ${buddyName}</i>`
  }

  const totalPnL = completed.reduce((s, t) => s + (t.pnl ?? 0), 0)
  const wins = completed.filter((t) => (t.pnl ?? 0) > 0).length
  const winRate = Math.round((wins / completed.length) * 100)
  const sign = totalPnL >= 0 ? '+' : ''

  const lines: string[] = [
    `🎙️ <b>Session — ${date}</b>`,
    '',
    `Trades: ${completed.length}  |  P&amp;L: <b>${sign}$${totalPnL.toFixed(0)}</b>  |  Win Rate: ${winRate}%`,
    '',
  ]

  // Up to 8 most recent trades
  const recent = completed.slice(-8)
  for (const t of recent) {
    const pnl = t.pnl ?? 0
    const pnlStr = `${pnl >= 0 ? '+' : ''}$${pnl.toFixed(0)}`
    const emotion = t.emotion_tag ? ` · ${t.emotion_tag}` : ''
    const score = t.execution_score != null ? ` · ${t.execution_score}/10` : ''
    const dir = t.direction ? ` ${t.direction}` : ''
    lines.push(`• ${t.instrument}${dir} — ${pnlStr}${emotion}${score}`)
  }

  lines.push('')
  lines.push(`<i>— ${buddyName}</i>`)

  return lines.join('\n')
}

export async function POST(): Promise<NextResponse> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('users')
      .select('telegram_chat_id, buddy_name, trading_timezone')
      .eq('id', user.id)
      .single()

    if (!profile?.telegram_chat_id) {
      return NextResponse.json({ sent: false, reason: 'not_connected' })
    }

    // Today's trades in user timezone
    const tz = profile.trading_timezone ?? 'UTC'
    const now = new Date()
    const todayStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(now) // YYYY-MM-DD

    const startOfDay = `${todayStr}T00:00:00`
    const endOfDay = `${todayStr}T23:59:59`

    const { data: trades } = await supabase
      .from('trades')
      .select('instrument, direction, pnl, emotion_tag, execution_score, opened_at, incomplete')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .gte('opened_at', startOfDay)
      .lte('opened_at', endOfDay)
      .order('opened_at', { ascending: true })

    const dateLabel = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      month: 'long', day: 'numeric', year: 'numeric',
    }).format(now)

    const buddyName = profile.buddy_name || 'Brew'
    const message = formatSummary((trades ?? []) as TradeRecord[], buddyName, dateLabel)

    const sent = await sendMessage(profile.telegram_chat_id, message)
    return NextResponse.json({ sent })
  } catch (e) {
    console.error('[telegram/summary] error:', e)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
