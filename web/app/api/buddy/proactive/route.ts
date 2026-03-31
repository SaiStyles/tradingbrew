import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { runContext } from '../agents/context'
import { runProactiveGate } from '../agents/proactive-gate'
import { runProactiveBuddy } from '../agents/proactive-buddy'
import { getTraderPortrait } from '@/lib/memory/hindsight'
import { getTodayInTz } from '../timezone'

// GET /api/buddy/proactive?trigger=session_start
// Called by BuddyChat on mount — returns a proactive opening message or null
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ message: null })

    const trigger_type = request.nextUrl.searchParams.get('trigger') ?? 'session_start'

    // Load profile + last session in parallel
    const [profileResult, sessionResult] = await Promise.all([
      supabase
        .from('users')
        .select('buddy_name, buddy_personality, trading_timezone')
        .eq('id', user.id)
        .single(),
      supabase
        .schema('public')
        .from('sessions')
        .select('conversation_state, started_at')
        .eq('user_id', user.id)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    const profile = profileResult.data
    const tradingTimezone = (profile?.trading_timezone as string | null) ?? 'America/New_York'
    const tradingDate = getTodayInTz(tradingTimezone)

    // Parse session state
    const sessionState = sessionResult.data?.conversation_state as Record<string, unknown> | null
    const sessionDate = sessionState?.session_date as string | undefined
    const sessionMessages = (sessionState?.messages as unknown[]) ?? []

    // For session_start: don't fire if the user has already been active today
    // (prevents double-greeting on page refresh)
    if (trigger_type === 'session_start' && sessionDate === tradingDate && sessionMessages.length > 0) {
      return NextResponse.json({ message: null })
    }

    // Days since last seen — used for reconnect mode detection
    const lastSeenAt = sessionResult.data?.started_at as string | undefined
    const daysSinceLastSeen = lastSeenAt
      ? Math.floor((Date.now() - new Date(lastSeenAt).getTime()) / (1000 * 60 * 60 * 24))
      : 0

    // If returning after 3+ days, override trigger for gate
    const effectiveTrigger = daysSinceLastSeen >= 3 ? 'returning_user' : trigger_type

    // Check last proactive message time (for rate limiting in gate)
    let lastProactiveAt: string | null = null
    try {
      const { data: lastProactive } = await supabase
        .from('proactive_log')
        .select('created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      lastProactiveAt = (lastProactive?.created_at as string | null) ?? null
    } catch {
      // proactive_log table may not exist yet — fall through
    }

    // Load portrait (from cache) + context in parallel
    const cachedPortrait = sessionState?.trader_portrait as string | undefined
    const [traderPortrait, context] = await Promise.all([
      cachedPortrait
        ? Promise.resolve(cachedPortrait)
        : getTraderPortrait(user.id, tradingDate),
      runContext(user.id, tradingTimezone, ''),
    ])

    const buddyUser = {
      buddy_name: (profile?.buddy_name as string | null) ?? 'Brew',
      buddy_personality: (profile?.buddy_personality as string | null) ?? 'Friendly Mentor',
      trading_timezone: tradingTimezone,
    }

    // Gate: should Buddy speak right now?
    const gate = await runProactiveGate({
      trigger_type: effectiveTrigger,
      traderPortrait,
      tradingDate,
      context,
      lastProactiveAt,
      daysSinceLastSeen,
      user: buddyUser,
    })

    if (!gate.should_speak) {
      return NextResponse.json({ message: null })
    }

    // Generate the proactive message
    const message = await runProactiveBuddy({
      mode: gate.mode,
      traderPortrait,
      context,
      tradingDate,
      user: buddyUser,
    })

    if (!message) {
      return NextResponse.json({ message: null })
    }

    // Log the proactive message — fire and forget, non-blocking
    // Used for rate limiting and analytics. Fails gracefully if table doesn't exist yet.
    supabase
      .from('proactive_log')
      .insert({ user_id: user.id, trigger_type: effectiveTrigger, mode: gate.mode })
      .then(({ error }) => {
        if (error) console.warn('[proactive] log insert failed (table may not exist yet):', error.message)
      })

    console.log(`[proactive] fired: ${gate.mode} (${effectiveTrigger}) for user ${user.id}`)
    return NextResponse.json({ message })

  } catch (error) {
    console.error('[proactive] route error:', error)
    return NextResponse.json({ message: null })
  }
}
