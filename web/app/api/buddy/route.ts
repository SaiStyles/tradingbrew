import { createClient } from '@/lib/supabase/server'
import { NextRequest, after } from 'next/server'
import type { ChatMessage, AnalystReport, ExtractedData } from '@/types/trade'
import { runExtractor } from './agents/extractor'
import { runContext } from './agents/context'
import { runAnalyst } from './agents/analyst'
import { createBuddyStream, runBuddy } from './agents/buddy'
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
  ensureBank_called: boolean // fire-and-forget once per session, not every message
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
    ensureBank_called: false,
  }
}

// ------------------------------------------------------------------
// Route handler — orchestrator only, no AI calls here
// ------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
    }

    const body: unknown = await request.json()
    if (
      typeof body !== 'object' || body === null ||
      !('message' in body) ||
      typeof (body as Record<string, unknown>).message !== 'string'
    ) {
      return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
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
          ensureBank_called: (raw.ensureBank_called as boolean) ?? false,
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
      session.trader_portrait = '' // force fresh reflect() for the new day
    }
    session.session_date = tradingDate

    // Lazy bank creation — fire-and-forget, only once per session (not every message)
    if (!session.ensureBank_called) {
      session.ensureBank_called = true
      ensureBank(user.id).catch(err => console.error('[hindsight] ensureBank failed:', err))
    }

    // Step 2: Extractor + Context in parallel
    const EXTRACTOR_EMPTY: ExtractedData = {
      instrument: null, direction: null, pnl: null,
      opened_at: null, closed_at: null,
      position_size: null,
      emotion: null, execution_score: null,
      followed_plan: null, market_condition: null,
      confirmed: false, declined: false, has_trade: false,
      query_type: null, query_subtype: null,
    }

    const t0 = Date.now()

    // Portrait: fetch once per trading day. Supabase cache checked first (free).
    const portraitPromise = session.trader_portrait
      ? Promise.resolve(session.trader_portrait)
      : Promise.race([
          getTraderPortrait(user.id, tradingDate),
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
    let enrichedContext = context
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

          if (error && error !== 'Only SELECT queries allowed') {
            const retryResult = await runQueryAnalyst({
              question: `${message}\n\n[Previous SQL failed with: ${error}. Fix and regenerate.]`,
              querySubtype: extracted.query_subtype,
              tradingTimezone,
              currentDate: tradingDate,
            })
            if (retryResult.needs_sql && retryResult.sql) {
              const retryExec = await runAnalyticsQuery(user.id, retryResult.sql)
              enrichedContext = { ...context, historicalQuery: { query_description: retryResult.query_description, results: retryExec.results, error: retryExec.error } }
            }
          } else {
            enrichedContext = { ...context, historicalQuery: { query_description: queryResult.query_description, results, error } }
          }
        } else {
          enrichedContext = { ...context, historicalQuery: { query_description: queryResult.query_description, results: [] } }
        }
      } catch (e) {
        console.error('[query-agent] failed:', e)
      }
    }

    // Step 3: Build buddy params
    const shouldRunAnalyst = extracted.has_trade || session.messages.length > 0
    const conversationSoFar: ChatMessage[] = [
      ...session.messages,
      { role: 'user' as const, content: message },
    ].slice(-20)

    const buddyParams = {
      message,
      extracted,
      context: enrichedContext,
      analysis: session.last_analysis ?? null,
      messages: session.messages,
      tradingDate,
      traderPortrait,
      user: {
        buddy_name: (profile?.buddy_name as string | null) ?? 'Brew',
        buddy_personality: (profile?.buddy_personality as string | null) ?? 'Friendly Mentor',
        trading_timezone: tradingTimezone,
      },
      model: 'claude-haiku-4-5-20251001' as const,
    }

    // Start Analyst + SaveDetector immediately — they run in background while Buddy streams
    const t1 = Date.now()
    const analystPromise = shouldRunAnalyst
      ? runAnalyst(extracted, enrichedContext).catch(() => null)
      : Promise.resolve(null)
    const saveDetectorPromise = (extracted.has_trade || session.messages.length > 0)
      ? runSaveDetector({ messages: conversationSoFar, extracted, tradingDate, tradingTimezone })
      : Promise.resolve({ reply: '', save_trade: false, trade_data: null })

    // Analyst violations writer — fires when Analyst finishes, never blocks the response
    const currentSessionId = sessionResult.data?.id ?? null
    analystPromise.then(analysis => {
      if (!analysis || analysis.violations.length === 0) return
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
      Promise.all([...violationInserts, ...triggerUpdates])
        .then(() => console.log('[violations] writes complete'))
        .catch(err => console.error('[violations] write failed:', err))
    }).catch(() => {})

    // ── Streaming SSE response ──────────────────────────────────────────
    // Buddy tokens stream to client immediately.
    // SaveDetector + Analyst run in parallel — usually done by the time streaming finishes.
    const encoder = new TextEncoder()

    // Register Scribe to run after response is sent.
    // scribePayload is populated at stream end before controller.close().
    const scribePayload: {
      buddyReply: string
      todayObservations: string[]
    } = { buddyReply: '', todayObservations: [] }

    after(async () => {
      if (!scribePayload.buddyReply) return
      try {
        const supabaseScribe = await createClient()

        const scribeOutput = await runScribe({
          message,
          buddyReply: scribePayload.buddyReply,
          extracted,
          context: enrichedContext,
          recentMessages: session.messages.slice(-8),
          existingMemories: [...context.memories, ...scribePayload.todayObservations],
          tradingTimezone,
        })
        if (!scribeOutput.should_write) return

        for (const memory of scribeOutput.memories) {
          await retainMemory(user.id, memory)
          console.log('[scribe] retained to hindsight')

          await supabaseScribe.from('psychology_log').insert({
            user_id: user.id,
            trade_id: session.last_trade_id ?? null,
            entry_date: tradingDate,
            observation: memory,
          })
        }
      } catch (err) {
        console.error('[scribe] background failed:', err)
      }
    })

    const stream = new ReadableStream({
      async start(controller) {
        let fullReply = ''

        try {
          // Try streaming first
          const buddyStream = createBuddyStream(buddyParams)

          if (buddyStream) {
            for await (const event of buddyStream) {
              if (
                event.type === 'content_block_delta' &&
                event.delta.type === 'text_delta'
              ) {
                const text = event.delta.text
                fullReply += text
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'token', text })}\n\n`))
              }
            }
          } else {
            // Fallback: no API key — use runBuddy which returns default message
            fullReply = await runBuddy(buddyParams)
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'token', text: fullReply })}\n\n`))
          }

          console.log('[agents] buddy streaming done:', Date.now() - t1, 'ms')

          // Only await SaveDetector — Analyst runs fully in background (violations handled above)
          const saveResult = await saveDetectorPromise

          console.log('[agents] save-detector done:', Date.now() - t1, 'ms')
          console.log('[save-detector] result:', JSON.stringify({ save_trade: saveResult.save_trade, instrument: saveResult.trade_data?.instrument, pnl: saveResult.trade_data?.pnl }))

          // Update conversation history
          const updatedMessages: ChatMessage[] = [
            ...session.messages,
            { role: 'user' as const, content: message },
            { role: 'assistant' as const, content: fullReply },
          ].slice(-20)

          // Save trade if SaveDetector decided to
          const saveDetectorFired = extracted.has_trade || session.messages.length > 0
          let savedTrade = null
          let tradeInsertError: string | null = null
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
              const currentSessionId = sessionResult.data?.id ?? null

              const { data: insertedTrade, error: insertError } = await supabase
                .from('trades')
                .insert({
                  user_id: user.id,
                  session_id: currentSessionId,
                  instrument: td.instrument ?? '',
                  direction: td.direction ?? null,
                  pnl: td.pnl ?? null,
                  position_size: td.position_size ?? null,
                  opened_at: td.opened_at ?? null,
                  closed_at: closedAt,
                  emotion_tag: td.emotion_tag ?? null,
                  execution_score: td.execution_score ?? null,
                  rr: td.rr ?? null,
                  market_condition: extracted.market_condition ?? null,
                  notes: null,
                  followed_plan: td.followed_plan ?? null,
                  incomplete,
                })
                .select()
                .single()

              if (insertError) {
                console.error('[buddy] trade save error:', JSON.stringify(insertError))
                tradeInsertError = insertError.message
              } else {
                console.log('[buddy] trade saved:', insertedTrade?.id)
                savedTrade = insertedTrade
                session.last_trade_id = insertedTrade?.id ?? null
                updatedMessages.push({
                  role: 'user' as const,
                  content: `[SYSTEM: Trade already saved — ${td.instrument} ${td.direction} $${td.pnl} at ${td.opened_at}. Do not save this trade again under any circumstances.]`,
                })
              }
            } catch (e) {
              console.error('[buddy] trade save exception:', e)
              tradeInsertError = e instanceof Error ? e.message : 'unknown exception'
            }
          }

          // Patch late execution_score onto last saved trade
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

          // Populate scribe payload for the after() handler
          scribePayload.buddyReply = fullReply
          // Fetch today's psychology_log — fire-and-forget, best effort
          try {
            const { data: todayLogs } = await supabase
              .from('psychology_log')
              .select('observation')
              .eq('user_id', user.id)
              .eq('entry_date', tradingDate)
              .order('created_at', { ascending: true })
            scribePayload.todayObservations = (todayLogs ?? []).map(r => r.observation as string)
          } catch { /* scribe still runs with empty observations */ }

          // Persist session state — fire-and-forget (not critical path)
          // last_analysis uses previous turn's value — Analyst runs in background and is one turn behind by design
          const sessionPayload = {
            messages: updatedMessages,
            last_analysis: session.last_analysis ?? null,
            session_date: tradingDate,
            trader_portrait: session.trader_portrait,
            last_trade_id: session.last_trade_id,
            ensureBank_called: session.ensureBank_called,
          }
          const existingId = sessionResult.data?.id
          if (existingId && !isNewDay) {
            supabase
              .schema('public')
              .from('sessions')
              .update({ conversation_state: sessionPayload })
              .eq('id', existingId)
              .then(({ error }) => { if (error) console.error('[buddy] session update error:', error) })
          } else {
            supabase
              .schema('public')
              .from('sessions')
              .insert({ user_id: user.id, started_at: new Date().toISOString(), conversation_state: sessionPayload })
              .then(({ error }) => { if (error) console.error('[buddy] session insert error:', error) })
          }

          console.log('[agents] total:', Date.now() - t0, 'ms')

          // Send done event with metadata
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'done',
            action: saveResult.save_trade ? 'save_trade' : null,
            trade_data: savedTrade,
            _debug: {
              save_detector_fired: saveDetectorFired,
              save_trade: saveResult.save_trade,
              session_messages_count: session.messages.length,
              has_trade: extracted.has_trade,
              trade_fields_found: saveResult.trade_data ? Object.keys(saveResult.trade_data) : null,
              ...(tradeInsertError ? { insert_error: tradeInsertError } : {}),
              ...(savedTrade ? { saved_trade_id: (savedTrade as { id?: string }).id } : {}),
            },
          })}\n\n`))

        } catch (err) {
          console.error('[buddy] stream error:', err)
          // Send error event so client doesn't hang
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', message: 'Something went wrong' })}\n\n`))
        } finally {
          controller.close()
        }
      }
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // disable Nginx buffering
      },
    })

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    console.error('[buddy] orchestrator error:', msg)
    return new Response(JSON.stringify({ error: 'Something went wrong' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}
