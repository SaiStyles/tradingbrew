// Morning briefing — called by Vercel cron or manual trigger.
// GET with CRON_SECRET header → finds all Telegram-connected users, sends each a
// personalized pre-session insight based on their recent trading history.
//
// Vercel cron config (vercel.json):
//   { "crons": [{ "path": "/api/telegram/briefing", "schedule": "30 13 * * 1-5" }] }
//   (13:30 UTC = 9:00 ET before NY open — adjust per user timezone below)
//
// Requires: CRON_SECRET, TELEGRAM_BOT_TOKEN, ANTHROPIC_API_KEY env vars

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

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

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Auth: either Vercel cron secret or authenticated user (for manual test)
  const cronSecret = request.headers.get('authorization')?.replace('Bearer ', '')
  const isCron = cronSecret === process.env.CRON_SECRET

  const supabase = await createClient()

  if (!isCron) {
    // Allow authenticated user to trigger their own briefing manually
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const result = await sendBriefingForUser(supabase, user.id)
    return NextResponse.json(result)
  }

  // Cron: send briefings to all connected users
  const { data: users, error } = await supabase
    .from('users')
    .select('id, telegram_chat_id, buddy_name, buddy_personality, trading_timezone')
    .not('telegram_chat_id', 'is', null)

  if (error || !users) {
    console.error('[briefing] fetch users failed:', error)
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }

  let sent = 0
  for (const u of users) {
    // Check if it's near market open in the user's timezone
    if (!isNearSessionOpen(u.trading_timezone ?? 'America/New_York')) continue

    try {
      const result = await sendBriefingForUser(supabase, u.id)
      if (result.sent) sent++
    } catch (e) {
      console.error(`[briefing] failed for user ${u.id}:`, e)
    }
  }

  return NextResponse.json({ sent, total: users.length })
}

// Check if current time is within 30 min of a major session open in the user's tz
function isNearSessionOpen(timezone: string): boolean {
  const now = new Date()
  const localStr = now.toLocaleString('en-US', { timeZone: timezone, hour12: false })
  const local = new Date(localStr)
  const hour = local.getHours()
  const min = local.getMinutes()
  const timeMin = hour * 60 + min

  // NY open window: 9:00-9:30 ET
  // London open window: 3:00-3:30 ET
  // Asia open window: 20:00-20:30 ET
  const windows = [
    { start: 540, end: 570 },   // 9:00-9:30
    { start: 180, end: 210 },   // 3:00-3:30
    { start: 1200, end: 1230 }, // 20:00-20:30
  ]

  return windows.some(w => timeMin >= w.start && timeMin <= w.end)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sendBriefingForUser(supabase: any, userId: string) {
  const { data: profile } = await supabase
    .from('users')
    .select('telegram_chat_id, buddy_name, buddy_personality, trading_timezone')
    .eq('id', userId)
    .single()

  if (!profile?.telegram_chat_id) return { sent: false, reason: 'not_connected' }

  const tz = profile.trading_timezone ?? 'America/New_York'
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // Fetch recent trades + psychology in parallel
  const [tradesResult, psychResult, rulesResult] = await Promise.all([
    supabase
      .from('trades')
      .select('instrument, direction, pnl, emotion_tag, execution_score, followed_plan, session, opened_at')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .gte('opened_at', sevenDaysAgo)
      .order('opened_at', { ascending: false })
      .limit(50),
    supabase
      .from('psychology_log')
      .select('entry_date, observation')
      .eq('user_id', userId)
      .gte('entry_date', sevenDaysAgo.slice(0, 10))
      .order('entry_date', { ascending: false })
      .limit(20),
    supabase
      .from('rules')
      .select('raw_text')
      .eq('user_id', userId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .limit(5),
  ])

  const trades = tradesResult.data ?? []
  const observations = (psychResult.data ?? []).map((r: { observation: string }) => r.observation).filter(Boolean)
  const rules = (rulesResult.data ?? []).map((r: { raw_text: string }) => r.raw_text)

  // Not enough data for a meaningful briefing
  if (trades.length < 3) {
    return { sent: false, reason: 'insufficient_data' }
  }

  // Build stats
  const totalPnL = trades.reduce((s: number, t: { pnl: number | null }) => s + (Number(t.pnl) || 0), 0)
  const wins = trades.filter((t: { pnl: number | null }) => (Number(t.pnl) || 0) > 0).length
  const winRate = Math.round((wins / trades.length) * 100)

  // Day of week analysis
  const dayName = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' }).format(new Date())

  // Trades on same day of week
  const todayDow = new Date().getDay()
  const sameDayTrades = trades.filter((t: { opened_at: string }) => {
    const d = new Date(t.opened_at)
    return d.getDay() === todayDow
  })
  const sameDayPnL = sameDayTrades.reduce((s: number, t: { pnl: number | null }) => s + (Number(t.pnl) || 0), 0)

  // Session distribution
  const sessionCounts: Record<string, number> = {}
  for (const t of trades) {
    if (t.session) sessionCounts[t.session] = (sessionCounts[t.session] || 0) + 1
  }
  const topSession = Object.entries(sessionCounts).sort((a, b) => b[1] - a[1])[0]

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { sent: false, reason: 'no_api_key' }

  const buddyName = profile.buddy_name || 'Brew'

  try {
    const anthropic = new Anthropic({ apiKey })
    const result = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: `You are ${buddyName}, a trading companion with this personality: ${profile.buddy_personality || 'Friendly Mentor'}.

Write a 2-3 sentence morning briefing for a trader about to start their day. This goes to Telegram — short, personal, real. No emojis. No bullet points. No generic motivation.

Say something specific and useful based on the data:
- Day-of-week patterns ("you've struggled on Wednesdays")
- Recent streaks or shifts
- A rule to keep in mind
- A psychology pattern Scribe noticed

Be the friend who texts before market open with the one thing they need to hear. Plain text only. 2-3 sentences max.`,
      messages: [{
        role: 'user',
        content: `Today is ${dayName}.

Last 7 days: ${trades.length} trades | ${winRate}% WR | ${totalPnL >= 0 ? '+' : ''}$${totalPnL.toFixed(0)}
${dayName} history: ${sameDayTrades.length} trades | ${sameDayPnL >= 0 ? '+' : ''}$${sameDayPnL.toFixed(0)}
Most active session: ${topSession ? `${topSession[0]} (${topSession[1]} trades)` : 'mixed'}

Active rules:\n${rules.length > 0 ? rules.map((r: string) => `- ${r}`).join('\n') : 'None'}

Recent Scribe observations:\n${observations.length > 0 ? observations.slice(0, 8).join('\n') : 'None yet.'}`,
      }],
    })

    const insight = result.content[0].type === 'text' ? result.content[0].text.trim() : ''
    if (!insight) return { sent: false, reason: 'empty_insight' }

    const message = `<b>${dayName} Briefing</b>\n\n${insight}\n\n<i>— ${buddyName}</i>`
    const sent = await sendTelegram(profile.telegram_chat_id, message)
    return { sent }
  } catch (e) {
    console.error('[briefing] AI failed:', e)
    return { sent: false, reason: 'ai_failed' }
  }
}
