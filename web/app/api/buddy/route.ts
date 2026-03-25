import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse, after } from 'next/server'
import type { ChatMessage, AnalystReport, ExtractedData } from '@/types/trade'
import { runExtractor } from './agents/extractor'
import { runContext } from './agents/context'
import { runAnalyst } from './agents/analyst'
import { runBuddy } from './agents/buddy'
import { runSaveDetector } from './agents/save-detector'
import { runScribe } from './agents/scribe'
import { runQueryAnalyst } from './agents/query-analyst'
import { runAnalyticsQuery } from '@/lib/supabase/run-analytics'
import { ensureBank, retainMemory, getTraderPortrait } from '@/lib/memory/hindsight'
import { getTodayInTz, nowInTz } from './timezone'

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

interface SessionState {
  messages: ChatMessage[]
  last_analysis: AnalystReport | null
  session_date: string    // YYYY-MM-DD in trading timezone
  trader_portrait: string // reflect() result, refreshed each new trading day
  last_trade_id: string | null // ID of last saved trade — used to patch late fields (e.g. execution_score)
}

// ------------------------------------------------------------------
// Defaults
// ------------------------------------------------------------------

function defaultSession(): SessionState {
  return {
    messages: [],
    last_analysis: null,
    session_date: '',
    trader_portrait: '',
    last_trade_id: null,
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

    // Step 1: Load profile + session in parallel, 4s timeout
    const step1Timeout = new Promise<null>(resolve => setTimeout(() => resolve(null), 4000))
    const step1Result = await Promise.race([
      Promise.all([
        supabase.from('users').select('id, buddy_name, buddy_personality, trading_timezone, buddy_voice_id').eq('id', user.id).single(),
        supabase
          .schema('public')
          .from('sessions')
          .select('*')
          .eq('user_id', user.id)
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]),
      step1Timeout,
    ])

    if (!step1Result) {
      console.error('[buddy] step 1 timeout — proceeding with defaults')
    }

    const [profileResult, sessionResult] = step1Result ?? [{ data: null }, { data: null }]

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
          session_date: (raw.session_date as string) ?? '',
          trader_portrait: (raw.trader_portrait as string) ?? '',
          last_trade_id: (raw.last_trade_id as string | null) ?? null,
        }
      } catch {
        session = defaultSession()
      }
    }

    // New trading day check — reset volatile session state
    const tradingDate = getTodayInTz(tradingTimezone)
    const isNewDay = !!session.session_date && session.session_date !== tradingDate
    if (isNewDay) {
      console.log('[buddy] new trading day detected, clearing session')
      session.messages = []
      session.last_analysis = null
    }
    session.session_date = tradingDate

    // Lazy bank creation — fire-and-forget, only matters on first message
    ensureBank(user.id).catch(err => console.error('[hindsight] ensureBank failed:', err))

    // Step 2: Extractor + Context in parallel
    const EXTRACTOR_EMPTY: ExtractedData = {
      instrument: null, direction: null, pnl: null,
      opened_at: null, closed_at: null,
      position_size: null,
      emotion: null, execution_score: null,
      followed_plan: null, confirmed: false,
      declined: false, has_trade: false,
      query_type: null, query_subtype: null,
    }

    const t0 = Date.now()

    // Portrait: fetch once per trading day. 3s timeout — if slow, use cached (empty for new users).
    const portraitPromise = session.trader_portrait
      ? Promise.resolve(session.trader_portrait)
      : Promise.race([
          getTraderPortrait(user.id),
          new Promise<string>(resolve => setTimeout(() => resolve(''), 3000)),
        ])

    const [extracted, context, freshPortrait] = await Promise.all([
      Promise.race([
        runExtractor(message, tradingTimezone),
        new Promise<ExtractedData>(resolve => setTimeout(() => resolve(EXTRACTOR_EMPTY), 2000)),
      ]),
      runContext(user.id, tradingTimezone, message),
      portraitPromise,
    ])

    const traderPortrait = freshPortrait || session.trader_portrait
    if (freshPortrait) session.trader_portrait = freshPortrait

    console.log('[agents] extractor + context + portrait:', Date.now() - t0, 'ms', traderPortrait ? '(portrait ready)' : '(no portrait yet)')

    // Step 2.5: Query Agent — runs only for historical analysis questions
    if (extracted.query_type === 'historical_analysis' && extracted.query_subtype !== 'psychology') {
      try {
        const queryResult = await runQueryAnalyst({
          question: message,
          querySubtype: extracted.query_subtype,
          tradingTimezone,
          currentDate: tradingDate,
        })

        if (queryResult.needs_sql && queryResult.sql) {
          const { results, error } = await runAnalyticsQuery(user.id, queryResult.sql)

          // Self-correction: if error, retry once with error context
          if (error && error !== 'Only SELECT queries allowed') {
            const retryResult = await runQueryAnalyst({
              question: `${message}\n\n[Previous SQL failed with: ${error}. Fix and regenerate.]`,
              querySubtype: extracted.query_subtype,
              tradingTimezone,
              currentDate: tradingDate,
            })
            if (retryResult.needs_sql && retryResult.sql) {
              const retryExec = await runAnalyticsQuery(user.id, retryResult.sql)
              context.historicalQuery = {
                query_description: retryResult.query_description,
                results: retryExec.results,
                error: retryExec.error,
              }
            }
          } else {
            context.historicalQuery = {
              query_description: queryResult.query_description,
              results,
              error,
            }
          }
        } else {
          // Psychology-only — no SQL, but mark it so Buddy knows to use memories
          context.historicalQuery = {
            query_description: queryResult.query_description,
            results: [],
          }
        }
      } catch (e) {
        console.error('[query-agent] failed:', e)
      }
    }

    // Step 3+4+5: Buddy + Analyst + SaveDetector — all in parallel
    const shouldRunAnalyst = extracted.has_trade || session.messages.length > 0
    const useHaiku = !session.last_analysis?.intervention_needed
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
        traderPortrait,
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
        ? runSaveDetector({ messages: conversationSoFar, extracted, tradingDate, tradingTimezone })
        : Promise.resolve({ reply: '', save_trade: false, trade_data: null }),
    ])
    const saveResult = saveResultRaw
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

      const writes = [
        ...violationInserts.map(p => Promise.resolve(p)),
        ...triggerUpdates.map(p => Promise.resolve(p)),
      ]

      console.log('[violations] session id:', currentSessionId, '| count:', analysis.violations.length)

      if (currentSessionId) {
        writes.push(
          Promise.resolve(supabase.rpc('increment_violation_count', {
            target_session_id: currentSessionId,
            increment_by: analysis.violations.length,
          }))
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
          tradingTimezone,
        })
        if (!scribeOutput.should_write) return

        for (const memory of scribeOutput.memories) {
          await retainMemory(user.id, memory)
          console.log('[scribe] retained to hindsight')
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
            entry_price: null,
            exit_price: null,
            stop_loss: null,
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
          session.last_trade_id = insertedTrade?.id ?? null
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

    // Step 8b: Patch late execution_score onto last saved trade (if trade already saved but score just came in)
    if (!saveResult.save_trade && session.last_trade_id && extracted.execution_score != null) {
      const clamped = Math.min(10, Math.max(1, Math.round(extracted.execution_score)))
      supabase
        .from('trades')
        .update({ execution_score: clamped })
        .eq('id', session.last_trade_id)
        .eq('user_id', user.id)
        .is('execution_score', null)
        .then(({ error }) => {
          if (error) console.error('[buddy] execution_score patch failed:', error)
          else console.log('[buddy] execution_score patched on trade:', session.last_trade_id)
        })
    }

    // Step 9: Persist session state
    const nextAnalysis = analysis ?? session.last_analysis ?? null
    const sessionPayload = {
      messages: updatedMessages,
      last_analysis: nextAnalysis,
      session_date: tradingDate,
      trader_portrait: session.trader_portrait,
      last_trade_id: session.last_trade_id,
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
