// Sends end-of-session summary to user's Telegram chat.
// POST (no body needed) — reads today's trades + psychology, generates AI insight, sends.
// Returns { sent: bool, reason?: string }

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { TradeRecord } from '@/types/trade'

async function sendTelegram(chatId: string, text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return false

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  })
  return res.ok
}

function buildTradeLines(trades: TradeRecord[]): string {
  return trades.slice(-10).map(t => {
    const pnl = t.pnl ?? 0
    const pnlStr = `${pnl >= 0 ? '+' : ''}$${pnl.toFixed(0)}`
    const dir = t.direction ? ` ${t.direction}` : ''
    const emotion = t.emotion_tag ? ` | ${t.emotion_tag}` : ''
    const score = t.execution_score != null ? ` | ${t.execution_score}/10` : ''
    return `${t.instrument}${dir} ${pnlStr}${emotion}${score}`
  }).join('\n')
}

export async function POST(): Promise<NextResponse> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('users')
      .select('telegram_chat_id, buddy_name, buddy_personality, trading_timezone')
      .eq('id', user.id)
      .single()

    if (!profile?.telegram_chat_id) {
      return NextResponse.json({ sent: false, reason: 'not_connected' })
    }

    const tz = profile.trading_timezone ?? 'America/New_York'
    const todayStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date())

    const startOfDay = `${todayStr}T00:00:00`
    const endOfDay = `${todayStr}T23:59:59`

    // Fetch today's trades + psychology observations in parallel
    const [tradesResult, psychResult] = await Promise.all([
      supabase
        .from('trades')
        .select('instrument, direction, pnl, emotion_tag, execution_score, followed_plan, exit_reason, session, mistakes, opened_at, incomplete')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .gte('opened_at', startOfDay)
        .lte('opened_at', endOfDay)
        .order('opened_at', { ascending: true }),
      supabase
        .from('psychology_log')
        .select('observation')
        .eq('user_id', user.id)
        .eq('entry_date', todayStr)
        .order('created_at', { ascending: true }),
    ])

    const trades = (tradesResult.data ?? []).filter(t => !t.incomplete) as TradeRecord[]
    const observations = (psychResult.data ?? []).map(r => r.observation as string).filter(Boolean)

    const buddyName = profile.buddy_name || 'Brew'
    const dateLabel = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, weekday: 'long', month: 'long', day: 'numeric',
    }).format(new Date())

    // No trades today — simple message, no AI call needed
    if (trades.length === 0) {
      const msg = `<b>${dateLabel}</b>\n\nNo trades recorded today.\n\n<i>— ${buddyName}</i>`
      const sent = await sendTelegram(profile.telegram_chat_id, msg)
      return NextResponse.json({ sent })
    }

    // Stats for header
    const totalPnL = trades.reduce((s, t) => s + (t.pnl ?? 0), 0)
    const wins = trades.filter(t => (t.pnl ?? 0) > 0).length
    const winRate = Math.round((wins / trades.length) * 100)
    const sign = totalPnL >= 0 ? '+' : ''

    // AI-powered insight — one Haiku call to tell the story
    let insight = ''
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (apiKey) {
      try {
        const anthropic = new Anthropic({ apiKey })
        const result = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 200,
          system: `You are ${buddyName}, a trading companion with this personality: ${profile.buddy_personality || 'Friendly Mentor'}.

Write a 2-3 sentence end-of-day observation for a trader. This goes to Telegram — keep it short, personal, and real. No emojis. No bullet points. No "great job" unless it's genuinely earned. Say what you actually noticed. Be direct.

If there are psychology observations from Scribe, weave them in naturally — don't quote them directly.
If there's a pattern (all losses were one instrument, emotions shifted after a loss, execution scores dropped), name it in one line.
If it was a good day, acknowledge it without being fake.
If it was a bad day, be honest but not piling on.

Plain text only. No HTML tags. 2-3 sentences max.`,
          messages: [{
            role: 'user',
            content: `Today's trades:\n${buildTradeLines(trades)}\n\nTotal: ${sign}$${totalPnL.toFixed(0)} | ${trades.length} trades | ${winRate}% win rate\n\nScribe observations:\n${observations.length > 0 ? observations.join('\n') : 'None today.'}`,
          }],
        })
        insight = result.content[0].type === 'text' ? result.content[0].text.trim() : ''
      } catch (e) {
        console.error('[telegram/summary] AI insight failed:', e)
      }
    }

    // Build message
    const header = `<b>${dateLabel}</b>\n\n${trades.length} trades  |  <b>${sign}$${totalPnL.toFixed(0)}</b>  |  ${winRate}% WR`
    const tradeList = trades.slice(-8).map(t => {
      const pnl = t.pnl ?? 0
      const pnlStr = `${pnl >= 0 ? '+' : ''}$${pnl.toFixed(0)}`
      const dir = t.direction ? ` ${t.direction}` : ''
      return `• ${t.instrument}${dir} — ${pnlStr}`
    }).join('\n')

    const parts = [header, '', tradeList]
    if (insight) parts.push('', insight)
    parts.push('', `<i>— ${buddyName}</i>`)

    const sent = await sendTelegram(profile.telegram_chat_id, parts.join('\n'))
    return NextResponse.json({ sent })
  } catch (e) {
    console.error('[telegram/summary] error:', e)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
