import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse, after } from 'next/server'
import type { ChatMessage, AnalystReport, ExtractedData } from '@/types/trade'
import { runExtractor } from './agents/extractor'
import { runContext } from './agents/context'
import { runAnalyst } from './agents/analyst'
import { runBuddy } from './agents/buddy'
import { runSaveDetector } from './agents/save-detector'
import { runScribe } from './agents/scribe'
import { getTodayInTz, nowInTz } from './timezone'

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
    const isNewDay = !!session.session_date && session.session_date !== tradingDate
    if (isNewDay) {
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

    // Step 3+4+5: Buddy + Analyst + SaveDetector — all in parallel
    const shouldRunAnalyst = extracted.has_trade || context.todaysTradeCount >= 3
    const useHaiku = !extracted.has_trade && (
      !session.last_analysis ||
      (session.last_analysis.violations.length === 0 && session.last_analysis.warnings.length === 0)
    )
    const conversationSoFar: ChatMessage[] = [
      ...session.messages,
      { role: 'user' as const, content: message },
    ].slice(-20)

    const t1 = Date.now()
    const [buddyReply, analysis, saveResultRaw] = await Promise.all([
      runBuddy({
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
        model: useHaiku ? 'claude-haiku-4-5-20251001' : 'claude-sonnet-4-6',
      }),
      shouldRunAnalyst
        ? runAnalyst(extracted, context).catch(() => null)
        : Promise.resolve(null),
      (extracted.has_trade || session.messages.length > 0)
        ? runSaveDetector({ messages: conversationSoFar, buddyReply: '', extracted, tradingDate, tradingTimezone })
        : Promise.resolve({ reply: '', save_trade: false, trade_data: null }),
    ])
    const saveResult = { ...saveResultRaw, reply: buddyReply }
    console.log('[agents] buddy + analyst + save-detector parallel:', Date.now() - t1, 'ms')
    console.log('[debug] shouldRunAnalyst:', shouldRunAnalyst, '| has_trade:', extracted.has_trade, '| useHaiku:', useHaiku)
    console.log('[save-detector] result:', JSON.stringify({ save_trade: saveResult.save_trade, instrument: saveResult.trade_data?.instrument, pnl: saveResult.trade_data?.pnl }))
    console.log('[agents] total:', Date.now() - t0, 'ms')

    // Step 6: Write rule violations — fire-and-forget
    if (analysis && analysis.violations && analysis.violations.length > 0) {
      const currentSessionId = sessionResult.data?.id ?? null

      const violationInserts = analysis.violations.map(v =>
        supabase.from('rule_violations').insert({
          rule_id: v.rule_id,
          user_id: user.id,
          trade_id: null,
          session_id: currentSessionId,
          analyst_reasoning: v.reasoning,
        })
      )

      const triggerUpdates = analysis.violations.map(v =>
        supabase.from('rules')
          .update({ last_triggered_at: new Date().toISOString() })
          .eq('id', v.rule_id)
      )

      const writes: Promise<unknown>[] = [...violationInserts, ...triggerUpdates]

      console.log('[violations] session id:', currentSessionId, '| count:', analysis.violations.length)

      if (currentSessionId) {
        writes.push(
          supabase.rpc('increment_violation_count', {
            target_session_id: currentSessionId,
            increment_by: analysis.violations.length,
          })
        )
      }

      Promise.all(writes)
        .then(() => console.log('[violations] writes complete'))
        .catch(err => console.error('[violations] write failed:', err))
    }

    // Step 7: Scribe — runs after response is sent, guaranteed by next/server after()
    after(async () => {
      try {
        const scribeOutput = await runScribe({
          message,
          buddyReply,
          extracted,
          context,
          recentMessages: session.messages.slice(-8),
          existingMemories: context.memories,
        })
        if (!scribeOutput.should_write) return

        for (const memory of scribeOutput.memories) {
          await supabase.from('memories').insert({
            user_id: user.id,
            content: memory.content,
            memory_type: memory.type,
            weight: memory.weight,
            buddy_instruction: memory.buddy_instruction,
            created_at: new Date().toISOString(),
          })
          console.log('[scribe] wrote:', memory.type, '| weight:', memory.weight)
        }

        const rawUpdates = scribeOutput.profile_updates
        const updates = Object.fromEntries(
          Object.entries(rawUpdates).filter(([, v]) => v !== null && v !== undefined)
        )
        if (Object.keys(updates).length > 0) {
          await supabase.from('users').update(updates).eq('id', user.id)
          console.log('[scribe] profile updated:', Object.keys(updates).join(', '))
        }
      } catch (err) {
        console.error('[scribe] background failed:', err)
      }
    })

    // Step 8 (was 7): Update conversation history
    const updatedMessages: ChatMessage[] = [
      ...session.messages,
      { role: 'user' as const, content: message },
      { role: 'assistant' as const, content: buddyReply },
    ].slice(-20)

    // Step 8: Save trade if SaveDetector decided to
    let savedTrade = null
    if (saveResult.save_trade && saveResult.trade_data) {
      const td = saveResult.trade_data
      if (td.execution_score != null) {
        td.execution_score = Math.min(10, Math.max(1, Math.round(td.execution_score)))
      }
      console.log('[route] about to save trade, session messages count:', session.messages.length)
      console.log('[buddy] SAVING TRADE:', JSON.stringify(td, null, 2))
      try {
        const closedAt = td.closed_at ?? nowInTz(tradingTimezone)
        const incomplete = !td.opened_at || !td.direction

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

          // Memory is handled by Scribe (fires after every Buddy response)
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
      if (existingId && !isNewDay) {
        const { error } = await supabase
          .schema('public')
          .from('sessions')
          .update({ conversation_state: sessionPayload })
          .eq('id', existingId)
        if (error) console.error('[buddy] session update error:', error)
      } else {
        // Insert new row: either no session exists, or it's a new trading day (preserve old day's record)
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
