import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { runProactiveGate } from '../buddy/agents/proactive-gate'
import { runProactiveBuddy } from '../buddy/agents/proactive-buddy'
import { getTraderPortrait } from '@/lib/memory/hindsight'
import { getTodayInTz } from '../buddy/timezone'
import type { ContextPacket, TradeRecord, AccountRecord } from '@/types/trade'

// POST /api/proactive-check
// Called by Vercel Cron every minute (requires Vercel Pro).
// Evaluates triggers for all active users and pushes messages to proactive_queue.
// BuddyChat subscribes to proactive_queue via Supabase Realtime.
//
// REQUIRES:
// 1. Vercel Pro (for per-minute cron)
// 2. CRON_SECRET env var (set same value in vercel.json and Vercel dashboard)
// 3. proactive_queue + proactive_log tables in Supabase (run docs/add-proactive-tables.sql)

export async function POST(request: NextRequest) {
  // Verify cron secret — Vercel sets this header automatically when using vercel.json crons
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = await createClient()
    let processed = 0
    let fired = 0

    // Find all users active in the last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: activeSessions, error: sessionsError } = await supabase
      .schema('public')
      .from('sessions')
      .select('user_id, started_at, conversation_state')
      .gte('started_at', sevenDaysAgo)
      .order('started_at', { ascending: false })

    if (sessionsError || !activeSessions) {
      console.error('[proactive-check] failed to load sessions:', sessionsError)
      return NextResponse.json({ error: 'DB error' }, { status: 500 })
    }

    // Dedupe: one entry per user (most recent session)
    const userSessions = new Map<string, { started_at: string; conversation_state: unknown }>()
    for (const s of activeSessions) {
      const uid = s.user_id as string
      if (!userSessions.has(uid)) {
        userSessions.set(uid, { started_at: s.started_at as string, conversation_state: s.conversation_state })
      }
    }

    for (const [userId, session] of userSessions) {
      try {
        processed++

        // Load user profile
        const { data: profile } = await supabase
          .from('users')
          .select('buddy_name, buddy_personality, trading_timezone')
          .eq('id', userId)
          .single()

        const tradingTimezone = (profile?.trading_timezone as string | null) ?? 'America/New_York'
        const tradingDate = getTodayInTz(tradingTimezone)

        // Check last proactive message (rate limit: 30 min between any two proactive messages)
        let lastProactiveAt: string | null = null
        try {
          const { data: lastP } = await supabase
            .from('proactive_log')
            .select('created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          lastProactiveAt = (lastP?.created_at as string | null) ?? null
        } catch { /* table may not exist */ }

        if (lastProactiveAt) {
          const msSince = Date.now() - new Date(lastProactiveAt).getTime()
          if (msSince < 30 * 60 * 1000) continue // Too soon
        }

        // Load today's trades for trigger evaluation
        const isoOffset = (() => {
          try {
            const now = new Date()
            const tz = new Intl.DateTimeFormat('en', { timeZone: tradingTimezone, timeZoneName: 'shortOffset' }).formatToParts(now)
            const offset = tz.find(p => p.type === 'timeZoneName')?.value ?? '+00:00'
            return offset.replace('GMT', '')
          } catch { return '+00:00' }
        })()
        const todayStart = `${tradingDate}T00:00:00${isoOffset}`
        const sevenDaysBack = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

        const [tradesRes, accountRes] = await Promise.all([
          supabase
            .from('trades')
            .select('*')
            .eq('user_id', userId)
            .is('deleted_at', null)
            .gte('created_at', sevenDaysBack)
            .order('created_at', { ascending: false })
            .limit(50),
          supabase
            .from('accounts')
            .select('*')
            .eq('user_id', userId)
            .limit(1)
            .maybeSingle(),
        ])

        const allTrades = (tradesRes.data ?? []) as TradeRecord[]
        const todayTrades = allTrades.filter(t => t.created_at >= todayStart)
        const prevTrades = allTrades.filter(t => t.created_at < todayStart)
        const account = (accountRes.data as AccountRecord | null) ?? null

        // Compute session stats
        const todaysPnL = todayTrades.reduce((s, t) => s + (Number(t.pnl) || 0), 0)
        const todaysTradeCount = todayTrades.length
        const todayWins = todayTrades.filter(t => (Number(t.pnl) || 0) > 0).length
        const todayWinRate = todayTrades.length > 0 ? Math.round((todayWins / todayTrades.length) * 100) : 0
        const weeklyPnL = allTrades.reduce((s, t) => s + (Number(t.pnl) || 0), 0)
        const weeklyWins = allTrades.filter(t => (Number(t.pnl) || 0) > 0).length
        const weeklyWinRate = allTrades.length > 0 ? Math.round((weeklyWins / allTrades.length) * 100) : 0

        // Streak computation
        const byDay = new Map<string, number>()
        for (const t of allTrades) {
          const day = t.created_at.slice(0, 10)
          byDay.set(day, (byDay.get(day) ?? 0) + (Number(t.pnl) || 0))
        }
        const days = Array.from(byDay.entries()).sort((a, b) => b[0].localeCompare(a[0]))
        let currentStreak: { type: 'win' | 'loss'; count: number } | null = null
        if (days.length >= 2) {
          const firstPnl = days[0][1]
          if (firstPnl !== 0) {
            const streakType = firstPnl > 0 ? 'win' : 'loss'
            let count = 0
            for (const [, pnl] of days) {
              if (pnl === 0) break
              if ((pnl > 0 ? 'win' : 'loss') !== streakType) break
              count++
            }
            if (count >= 2) currentStreak = { type: streakType, count }
          }
        }

        const context: ContextPacket = {
          todaysTrades: todayTrades,
          todaysPnL,
          todaysTradeCount,
          todayWinRate,
          todayAvgPnL: todayTrades.length > 0 ? todaysPnL / todayTrades.length : 0,
          weeklyPnL,
          weeklyTradeCount: allTrades.length,
          weeklyWinRate,
          currentStreak,
          active_rules: [],
          account,
          upcomingNews: [],
          memories: [],
          dataError: !!tradesRes.error,
          historicalQuery: null,
        }

        // ── Trigger evaluation (pure TS — no AI) ────────────────────────
        const recentLossRun = (() => {
          const sorted = [...todayTrades].sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          )
          let streak = 0
          for (const t of sorted) {
            if ((Number(t.pnl) || 0) < 0) streak++
            else break
          }
          return streak
        })()

        const daysSinceLastSeen = Math.floor(
          (Date.now() - new Date(session.started_at).getTime()) / (1000 * 60 * 60 * 24)
        )

        // Determine which trigger fired
        let trigger_type: string | null = null

        if (recentLossRun >= 3) {
          trigger_type = 'loss_streak'
        } else if (
          account?.daily_loss_limit &&
          todaysPnL < 0 &&
          Math.abs(todaysPnL) >= account.daily_loss_limit * 0.8
        ) {
          trigger_type = 'drawdown_threshold'
        } else if (daysSinceLastSeen >= 3) {
          trigger_type = 'returning_user'
        } else {
          // EOD debrief: check if it's past market close in user's timezone and they haven't had a debrief today
          const nowInTz = new Date().toLocaleTimeString('en-US', { timeZone: tradingTimezone, hour12: false })
          const [hour] = nowInTz.split(':').map(Number)
          const isAfterClose = hour >= 17 // 5 PM in trading timezone
          if (isAfterClose && todaysTradeCount > 0) {
            // Check if already debriefed today
            let alreadyDebriefed = false
            try {
              const { data: debrief } = await supabase
                .from('proactive_log')
                .select('id')
                .eq('user_id', userId)
                .eq('mode', 'debrief')
                .gte('created_at', `${tradingDate}T00:00:00Z`)
                .maybeSingle()
              alreadyDebriefed = !!debrief
            } catch { /* ignore */ }

            if (!alreadyDebriefed) trigger_type = 'eod_debrief'
          }
        }

        if (!trigger_type) continue // No trigger — skip this user

        // Get trader portrait (from session cache first)
        const sessionState = session.conversation_state as Record<string, unknown> | null
        const cachedPortrait = sessionState?.trader_portrait as string | undefined
        const traderPortrait = cachedPortrait || await getTraderPortrait(userId, tradingDate)

        const buddyUser = {
          buddy_name: (profile?.buddy_name as string | null) ?? 'Brew',
          buddy_personality: (profile?.buddy_personality as string | null) ?? 'Friendly Mentor',
          trading_timezone: tradingTimezone,
        }

        // Gate
        const gate = await runProactiveGate({
          trigger_type,
          traderPortrait,
          tradingDate,
          context,
          lastProactiveAt,
          daysSinceLastSeen,
          user: buddyUser,
        })

        if (!gate.should_speak) continue

        // Generate message
        const message = await runProactiveBuddy({
          mode: gate.mode,
          traderPortrait,
          context,
          tradingDate,
          user: buddyUser,
        })

        if (!message) continue

        // Push to proactive_queue — Supabase Realtime delivers to BuddyChat
        const { error: queueError } = await supabase
          .from('proactive_queue')
          .insert({ user_id: userId, message, mode: gate.mode, trigger_type })

        if (queueError) {
          console.error('[proactive-check] queue insert failed:', queueError.message)
          continue
        }

        // Log for rate limiting
        supabase
          .from('proactive_log')
          .insert({ user_id: userId, trigger_type, mode: gate.mode })
          .then(({ error }) => {
            if (error) console.warn('[proactive-check] log failed:', error.message)
          })

        console.log(`[proactive-check] fired: ${gate.mode} (${trigger_type}) for ${userId}`)
        fired++

      } catch (userErr) {
        console.error(`[proactive-check] error processing user ${userId}:`, userErr)
      }
    }

    return NextResponse.json({ processed, fired })

  } catch (error) {
    console.error('[proactive-check] fatal error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
