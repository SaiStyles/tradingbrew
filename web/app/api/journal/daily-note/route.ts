import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'
import { withRetry } from '@/lib/claude/retry'
import { getTodayInTz } from '@/app/api/buddy/timezone'
import type { TradeRecord } from '@/types/trade'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const date = request.nextUrl.searchParams.get('date')
    if (!date) return NextResponse.json({ error: 'date required (YYYY-MM-DD)' }, { status: 400 })

    // Check cache
    const { data: cached } = await supabase
      .from('daily_ai_notes')
      .select('note, generated_at')
      .eq('user_id', user.id)
      .eq('entry_date', date)
      .maybeSingle()

    if (cached) {
      // Check if any trade or psychology observation was created after the note was generated
      const [{ data: newerTrade }, { data: newerObs }] = await Promise.all([
        supabase
          .from('trades')
          .select('created_at')
          .eq('user_id', user.id)
          .is('deleted_at', null)
          .gte('created_at', `${date}T00:00:00`)
          .lt('created_at', `${date}T23:59:59`)
          .gt('created_at', cached.generated_at)
          .limit(1)
          .maybeSingle(),
        supabase
          .from('psychology_log')
          .select('created_at')
          .eq('user_id', user.id)
          .eq('entry_date', date)
          .gt('created_at', cached.generated_at)
          .limit(1)
          .maybeSingle(),
      ])

      // Cache is fresh — nothing new since the note was generated
      if (!newerTrade && !newerObs) {
        return NextResponse.json({ note: cached.note, cached: true })
      }
    }

    // Past day with no cached note — don't generate retroactively
    const timezone = request.nextUrl.searchParams.get('timezone') ?? 'UTC'
    const today = getTodayInTz(timezone)
    if (date < today) {
      return NextResponse.json({ note: null })
    }

    // Fetch trades for that day
    const { data: trades } = await supabase
      .from('trades')
      .select('instrument, direction, pnl, emotion_tag, execution_score, followed_plan, opened_at, closed_at')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .gte('created_at', `${date}T00:00:00`)
      .lt('created_at', `${date}T23:59:59`)
      .order('created_at', { ascending: true })

    // Fetch psychology observations for that day
    const { data: observations } = await supabase
      .from('psychology_log')
      .select('observation')
      .eq('user_id', user.id)
      .eq('entry_date', date)
      .order('created_at', { ascending: true })

    const tradeList = (trades ?? []) as Partial<TradeRecord>[]
    const obsList = (observations ?? []).map(o => o.observation)

    // Nothing to write a note about
    if (tradeList.length === 0 && obsList.length === 0) {
      return NextResponse.json({ note: null })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ note: null })

    const anthropic = new Anthropic({ apiKey })

    const totalPnL = tradeList.reduce((s, t) => s + (Number(t.pnl) || 0), 0)
    const wins = tradeList.filter(t => (Number(t.pnl) || 0) > 0).length
    const tradesStr = tradeList.map(t =>
      `${t.instrument} ${t.direction} | P&L: $${t.pnl} | emotion: ${t.emotion_tag ?? '—'} | execution: ${t.execution_score ?? '—'}/10 | followed plan: ${t.followed_plan === true ? 'yes' : t.followed_plan === false ? 'no' : '—'}`
    ).join('\n')

    const obsStr = obsList.length > 0 ? obsList.join('\n') : 'No observations recorded.'

    const prompt = `You write the AI Note for a trader's journal. It appears at the top of their day view.

DATE: ${date}
TRADES (${tradeList.length} total, ${wins} wins, $${totalPnL.toFixed(0)} P&L):
${tradesStr || 'No trades.'}

WHAT WAS OBSERVED ABOUT THIS TRADER TODAY:
${obsStr}

Write 3-5 sentences. Warm, direct, like a thoughtful friend reflecting on their day — not a coach, not a report.
Lead with the truth of what happened, then the meaning.
Never clinical. Never list format. Never start with "Today".
If it was a good day — honor it simply. If it was rough — don't sugarcoat, but don't pile on.
Plain text only.`

    const result = await withRetry(() => anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 250,
      messages: [{ role: 'user', content: prompt }],
    }))

    const note = result.content[0].type === 'text' ? result.content[0].text.trim() : null
    if (!note) return NextResponse.json({ note: null })

    // Cache the note
    await supabase.from('daily_ai_notes').upsert({
      user_id: user.id,
      entry_date: date,
      note,
      generated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,entry_date' })

    return NextResponse.json({ note, cached: false })
  } catch (e) {
    console.error('[daily-note] failed:', e)
    return NextResponse.json({ note: null })
  }
}
