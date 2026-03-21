import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import type { ChatMessage, AnalystReport, ExtractedData } from '@/types/trade'
import { runExtractor } from './agents/extractor'
import { runContext } from './agents/context'
import { runAnalyst } from './agents/analyst'
import { runBuddy } from './agents/buddy'
import { runSaveDetector } from './agents/save-detector'
import { getTodayInTz, nowInTz } from './timezone'
import { writeMemory } from '@/lib/memory/mem0'

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

interface SessionState {
  messages: ChatMessage[]
  last_analysis: AnalystReport | null
  cached_memories: string[]
  memories_cached_at: string // ISO timestamp, empty = never cached
  session_date: string       // YYYY-MM-DD in trading timezone
}

// ------------------------------------------------------------------
// Defaults
// ------------------------------------------------------------------

function defaultSession(): SessionState {
  return {
    messages: [],
    last_analysis: null,
    cached_memories: [],
    memories_cached_at: '',
    session_date: '',
  }
}

// ------------------------------------------------------------------
// Route handler — orchestrator only, no AI calls here
// ------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body: unknown = await request.json()
    if (
      typeof body !== 'object' || body === null ||
      !('message' in body) ||
      typeof (body as Record<string, unknown>).message !== 'string'
    ) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }
    const { message } = body as { message: string }

    // Step 1: Load profile + session in parallel
    const [profileResult, sessionResult] = await Promise.all([
      supabase.from('users').select('*').eq('id', user.id).single(),
      supabase
        .schema('public')
        .from('sessions')
        .select('*')
        .eq('user_id', user.id)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    const profile = profileResult.data
    const tradingTimezone = (profile?.trading_timezone as string | null) ?? 'America/New_York'

    // Parse session state
    let session: SessionState = defaultSession()
    if (sessionResult.data?.conversation_state) {
      try {
        const raw = sessionResult.data.conversation_state as Record<string, unknown>
        session = {
          messages: (raw.messages as ChatMessage[]) ?? [],
          last_analysis: (raw.last_analysis as AnalystReport | null) ?? null,
          cached_memories: (raw.cached_memories as string[]) ?? [],
          memories_cached_at: (raw.memories_cached_at as string) ?? '',
          session_date: (raw.session_date as string) ?? '',
        }
      } catch {
        session = defaultSession()
      }
    }

    // New trading day check — reset volatile session state, keep Mem0/Supabase data intact
    const tradingDate = getTodayInTz(tradingTimezone)
    if (session.session_date && session.session_date !== tradingDate) {
      console.log('[buddy] new trading day detected, clearing session')
      session.messages = []
      session.last_analysis = null
      session.cached_memories = []
      session.memories_cached_at = ''
    }
    session.session_date = tradingDate

    // Step 2: Extractor + Context in parallel
    // Memory cache: valid if non-empty AND under 5 minutes old
    const FIVE_MIN = 5 * 60 * 1000
    const cacheAge = session.memories_cached_at
      ? Date.now() - new Date(session.memories_cached_at).getTime()
      : Infinity
    const memoryCacheValid = session.cached_memories.length > 0 && cacheAge < FIVE_MIN
    const cachedMemories = memoryCacheValid ? session.cached_memories : undefined

    const EXTRACTOR_EMPTY: ExtractedData = {
      instrument: null, direction: null, pnl: null,
      opened_at: null, closed_at: null,
      entry_price: null, exit_price: null,
      stop_loss: null, position_size: null,
      emotion: null, execution_score: null,
      followed_plan: null, confirmed: false,
      declined: false, has_trade: false,
    }

    const t0 = Date.now()
    const [extracted, context] = await Promise.all([
      Promise.race([
        runExtractor(message, tradingTimezone),
        new Promise<ExtractedData>(resolve => setTimeout(() => resolve(EXTRACTOR_EMPTY), 2000)),
      ]),
      runContext(user.id, tradingTimezone, cachedMemories),
    ])
    console.log('[agents] extractor + context:', Date.now() - t0, 'ms', memoryCacheValid ? '(mem cached)' : '(mem fresh)')

    // Step 3: Fire Analyst in background — no await, never blocks Buddy
    const shouldRunAnalyst = extracted.has_trade || context.todaysTradeCount >= 3
    const t1 = Date.now()
    const analysisPromise = shouldRunAnalyst
      ? runAnalyst(extracted, context, {}).catch(() => null)
      : Promise.resolve(null)

    // Step 4: Run Buddy → plain text reply
    const t2 = Date.now()
    const buddyReply = await runBuddy({
      message,
      extracted,
      context,
      analysis: session.last_analysis ?? null,
      messages: session.messages,
      tradingDate,
      user: {
        buddy_name: (profile?.buddy_name as string | null) ?? 'Brew',
        buddy_personality: (profile?.buddy_personality as string | null) ?? 'Friendly Mentor',
        trading_timezone: tradingTimezone,
      },
    })
    console.log('[agents] buddy:', Date.now() - t2, 'ms')

    // Step 5: Run SaveDetector with full conversation + buddy reply
    const t3 = Date.now()
    const conversationSoFar: ChatMessage[] = [
      ...session.messages,
      { role: 'user' as const, content: message },
    ]
    console.log('[save-detector] calling with messages count:', conversationSoFar.length, 'last message:', conversationSoFar[conversationSoFar.length - 1]?.content?.slice(0, 50))
    const saveResult = await runSaveDetector({
      messages: conversationSoFar,
      buddyReply,
      extracted,
      tradingDate,
      tradingTimezone,
    })
    console.log('[agents] save-detector:', Date.now() - t3, 'ms')
    console.log('[save-detector] result:', JSON.stringify({ save_trade: saveResult.save_trade, has_trade_data: !!saveResult.trade_data, instrument: saveResult.trade_data?.instrument, pnl: saveResult.trade_data?.pnl }))
    console.log('[agents] total:', Date.now() - t0, 'ms')

    // Step 6: Non-blocking check — grab Analyst if it already finished
    const analysis = await Promise.race([analysisPromise, Promise.resolve(null)])
    if (shouldRunAnalyst) console.log('[agents] analyst:', Date.now() - t1, 'ms', analysis === null ? '(still running / skipped)' : '(done)')

    // Step 7: Update conversation history
    const updatedMessages: ChatMessage[] = [
      ...session.messages,
      { role: 'user' as const, content: message },
      { role: 'assistant' as const, content: buddyReply },
    ].slice(-10)

    // Step 8: Save trade if SaveDetector decided to
    let savedTrade = null
    if (saveResult.save_trade && saveResult.trade_data) {
      const td = saveResult.trade_data
      if (td.execution_score != null) {
        td.execution_score = Math.round(td.execution_score)
      }
      console.log('[route] about to save trade, session messages count:', session.messages.length)
      console.log('[buddy] SAVING TRADE:', JSON.stringify(td, null, 2))
      try {
        const closedAt = td.closed_at ?? nowInTz(tradingTimezone)
        const incomplete = !td.opened_at || !td.closed_at || !td.direction

        const { data: insertedTrade, error: insertError } = await supabase
          .from('trades')
          .insert({
            user_id: user.id,
            instrument: td.instrument ?? '',
            direction: td.direction ?? null,
            entry_price: td.entry_price ?? null,
            exit_price: td.exit_price ?? null,
            stop_loss: td.stop_loss ?? null,
            pnl: td.pnl ?? null,
            position_size: td.position_size ?? null,
            opened_at: td.opened_at ?? null,
            closed_at: closedAt,
            emotion_tag: td.emotion_tag ?? null,
            execution_score: td.execution_score ?? null,
            notes: td.notes ?? null,
            followed_plan: td.followed_plan ?? null,
            incomplete,
            deleted_at: null,
          })
          .select()
          .single()

        if (insertError) {
          console.error('[buddy] trade save error:', insertError)
        } else {
          console.log('[buddy] trade saved:', insertedTrade?.id)
          savedTrade = insertedTrade
          updatedMessages.push({
            role: 'user' as const,
            content: `[SYSTEM: Trade already saved — ${td.instrument} ${td.direction} $${td.pnl} at ${td.opened_at}. Do not save this trade again under any circumstances.]`,
          })

          // WRITE 1 — trade insight (fire-and-forget)
          const t = insertedTrade
          if (t) {
            const tradeInsight = `${tradingDate}: Trader closed ${t.instrument} ${t.direction} with ${(t.pnl ?? 0) > 0 ? '+' : ''}$${t.pnl} PnL. Execution score: ${t.execution_score}/10. Emotion: ${t.emotion_tag}. Followed plan: ${t.followed_plan ? 'yes' : 'no'}. Entry: ${t.opened_at}. Exit: ${t.closed_at}.${t.incomplete ? ' Trade data incomplete.' : ''}`
            writeMemory(user.id, tradeInsight).catch(e => console.log('[mem0] write error:', e))
          }

          // WRITE 2 — session insight (fire-and-forget)
          if (context.todaysTradeCount > 0) {
            const sessionInsight = `${tradingDate}: Session summary. Trades: ${context.todaysTradeCount}. Total PnL: ${context.todaysPnL > 0 ? '+' : ''}$${context.todaysPnL.toFixed(2)}. Patterns: ${analysis?.patterns?.join(', ') || 'none'}. Warnings: ${analysis?.warnings?.join(', ') || 'none'}. Violations: ${analysis?.violations?.join(', ') || 'none'}.`
            writeMemory(user.id, sessionInsight).catch(e => console.log('[mem0] write error:', e))
          }
        }
      } catch (e) {
        console.error('[buddy] trade save exception:', e)
      }
    }

    // Step 9: Persist session state
    const nextAnalysis = analysis ?? session.last_analysis ?? null
    const sessionPayload = {
      messages: updatedMessages,
      last_analysis: nextAnalysis,
      cached_memories: context.memories,
      memories_cached_at: new Date().toISOString(),
      session_date: tradingDate,
    }

    try {
      const existingId = sessionResult.data?.id
      if (existingId) {
        const { error } = await supabase
          .schema('public')
          .from('sessions')
          .update({ conversation_state: sessionPayload })
          .eq('id', existingId)
        if (error) console.error('[buddy] session update error:', error)
      } else {
        const { error } = await supabase
          .schema('public')
          .from('sessions')
          .insert({ user_id: user.id, started_at: new Date().toISOString(), conversation_state: sessionPayload })
        if (error) console.error('[buddy] session insert error:', error)
      }
    } catch (e) {
      console.error('[buddy] session persist exception:', e)
    }

    // Step 10: Return
    return NextResponse.json({
      reply: buddyReply,
      action: saveResult.save_trade ? 'save_trade' : null,
      trade_data: savedTrade,
    })

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    console.error('[buddy] orchestrator error:', msg)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
