import { createClient } from '@/lib/supabase/server'
import { NextRequest, after } from 'next/server'

export const runtime = 'nodejs'
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
// Emotion normalization — map free-text emotions to valid EmotionTag enum values
// ------------------------------------------------------------------

const VALID_EMOTIONS = new Set(['confident', 'hesitant', 'FOMO', 'revenge', 'bored', 'calm', 'frustrated', 'euphoric'])
const EMOTION_MAP: Record<string, string> = {
  nervous: 'hesitant', anxious: 'hesitant', scared: 'hesitant', uncertain: 'hesitant', worried: 'hesitant',
  panicked: 'frustrated', angry: 'frustrated', annoyed: 'frustrated', upset: 'frustrated',
  greedy: 'FOMO', excited: 'FOMO', impatient: 'FOMO',
  happy: 'confident', good: 'confident', strong: 'confident',
}

function normalizeEmotion(raw: string | null): string | null {
  if (!raw) return null
  if (VALID_EMOTIONS.has(raw)) return raw          // exact match (handles 'FOMO' case)
  const lower = raw.toLowerCase()
  if (VALID_EMOTIONS.has(lower)) return lower      // lowercase match
  return EMOTION_MAP[lower] ?? null                // near-miss map, or drop
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
    const { message, mode = 'explorer' } = body as { message: string; mode?: string }
    const isRecorder = mode === 'recorder'
    const isExplorer = mode === 'explorer'

    // Step 1: Load profile + session in parallel, 4s timeout
    const step1Timeout = new Promise<null>(resolve => setTimeout(() => resolve(null), 4000))
    const step1Result = await Promise.race([
      Promise.all([
        supabase.from('users').select('id, buddy_name, buddy_personality, trading_timezone').eq('id', user.id).single(),
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
      exit_reason: null, rr: null, session: null,
      confirmed: false, declined: false, has_trade: false,
      query_type: null, query_subtype: null,
    }

    const t0 = Date.now()

    // Portrait: explorer only — Buddy needs it. Recorder has no Buddy, skip the fetch entirely.
    const portraitPromise = isExplorer
      ? (session.trader_portrait
          ? Promise.resolve(session.trader_portrait)
          : Promise.race([
              getTraderPortrait(user.id, tradingDate),
              new Promise<string>(resolve => setTimeout(() => resolve(''), 3000)),
            ]))
      : Promise.resolve(session.trader_portrait || '')

    const [extracted, context, freshPortrait] = await Promise.all([
      // Recorder: lean prompt, trade fields only.
      // Explorer: full prompt, query_type detection needed to gate QueryAnalyst.
      Promise.race([
        runExtractor(message, tradingTimezone, isRecorder ? 'recorder' : 'explorer'),
        new Promise<ExtractedData>(resolve => setTimeout(() => resolve(EXTRACTOR_EMPTY), 2000)),
      ]),
      runContext(user.id, tradingTimezone, message),
      portraitPromise,
    ])

    const traderPortrait = freshPortrait || session.trader_portrait
    if (freshPortrait) session.trader_portrait = freshPortrait

    console.log('[agents] extractor + context + portrait:', Date.now() - t0, 'ms', traderPortrait ? '(portrait ready)' : '(no portrait yet)')

    // Step 2.5: Query Agent — explorer only, always runs.
    // QueryAnalyst owns all routing decisions via needs_sql flag — no upstream gate needed.
    // needs_sql:false for casual chat (cheap), needs_sql:true fires SQL execution.
    let enrichedContext = context
    if (isExplorer) {
      try {
        const queryResult = await runQueryAnalyst({
          question: message,
          tradingTimezone,
          currentDate: tradingDate,
        })

        if (queryResult.needs_sql && queryResult.sql) {
          const { results, error } = await runAnalyticsQuery(user.id, queryResult.sql)

          if (error && error !== 'Only SELECT queries allowed') {
            const retryResult = await runQueryAnalyst({
              question: `${message}\n\n[Previous SQL failed with: ${error}. Fix and regenerate.]`,
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

        // Fetch psychology_log observations for the same period, if AI generated psychology_sql
        if (queryResult.psychology_sql && enrichedContext.historicalQuery) {
          try {
            const { results: psychRows } = await runAnalyticsQuery(user.id, queryResult.psychology_sql)
            const observations = psychRows
              .map(r => r.observation as string)
              .filter((o): o is string => typeof o === 'string' && o.length > 0)
            if (observations.length > 0) {
              enrichedContext = {
                ...enrichedContext,
                historicalQuery: { ...enrichedContext.historicalQuery, psychology_results: observations },
              }
            }
          } catch (pe) {
            console.error('[query-agent] psychology_sql failed:', pe)
          }
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
    // SaveDetector: recorder only. Explorer never saves trades.
    const saveDetectorPromise = (isRecorder && (extracted.has_trade || session.messages.length > 0))
      ? runSaveDetector({ extracted, tradingDate, tradingTimezone })
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
      // Explorer: runs when Buddy replied. Recorder: runs when a trade was captured.
      if (!scribePayload.buddyReply && !extracted.has_trade) return
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
          if (isExplorer) {
            // Explorer: stream Buddy tokens to client
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
              // Fallback: no API key
              fullReply = await runBuddy(buddyParams)
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'token', text: fullReply })}\n\n`))
            }
            console.log('[agents] buddy streaming done:', Date.now() - t1, 'ms')
          }
          // Recorder: no Buddy call — silent operation, just save and done

          // Only await SaveDetector — Analyst runs fully in background (violations handled above)
          const saveResult = await saveDetectorPromise

          console.log('[agents] save-detector done:', Date.now() - t1, 'ms')
          console.log('[save-detector] result:', JSON.stringify({ save_trade: saveResult.save_trade, instrument: saveResult.trade_data?.instrument, pnl: saveResult.trade_data?.pnl }))

          // Save trade if SaveDetector decided to
          const saveDetectorFired = extracted.has_trade || session.messages.length > 0
          let savedTrade = null
          let tradeInsertError: string | null = null
          let systemMarker: ChatMessage | null = null
          if (saveResult.save_trade && saveResult.trade_data) {
            const td = saveResult.trade_data
            if (td.execution_score != null) {
              td.execution_score = Math.min(10, Math.max(1, Math.round(td.execution_score)))
            }
            console.log('[route] about to save trade, session messages count:', session.messages.length)
            console.log('[buddy] SAVING TRADE:', JSON.stringify(td, null, 2))
            try {
              const closedAt = td.closed_at ?? nowInTz(tradingTimezone)
              const incomplete = !(td.opened_at ?? extracted.opened_at) || !(td.direction ?? extracted.direction)
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
                  emotion_tag: normalizeEmotion(td.emotion_tag ?? extracted.emotion ?? null),
                  execution_score: td.execution_score ?? null,
                  rr: td.rr ?? null,
                  exit_reason: td.exit_reason ?? extracted.exit_reason ?? null,
                  session: td.session ?? extracted.session ?? null,
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
                systemMarker = {
                  role: 'user' as const,
                  content: `[SYSTEM: Trade already saved — ${td.instrument} ${td.direction} $${td.pnl} at ${td.opened_at}. Do not save this trade again under any circumstances.]`,
                }
              }
            } catch (e) {
              console.error('[buddy] trade save exception:', e)
              tradeInsertError = e instanceof Error ? e.message : 'unknown exception'
            }
          }

          // Update conversation history — built immutably with optional system marker included
          const updatedMessages: ChatMessage[] = [
            ...(isExplorer
              ? [
                  ...session.messages,
                  { role: 'user' as const, content: message },
                  { role: 'assistant' as const, content: fullReply },
                ]
              : [
                  ...session.messages,
                  { role: 'user' as const, content: message },
                ]),
            ...(systemMarker ? [systemMarker] : []),
          ].slice(-20)

          // Patch late enrichment fields onto last saved trade (fire-and-forget)
          // Fires when no new trade was saved but extracted fields arrived (e.g. "felt frustrated", "9 on execution")
          if (!saveResult.save_trade && session.last_trade_id) {
            const lateEmotion = normalizeEmotion(extracted.emotion ?? null)
            const lateExecution = extracted.execution_score != null
              ? Math.min(10, Math.max(1, Math.round(extracted.execution_score)))
              : null
            const lateSession = extracted.session ?? null
            const lateFollowedPlan = extracted.followed_plan ?? null
            const lateExitReason = extracted.exit_reason ?? null

            const hasAnyLate = lateEmotion !== null || lateExecution !== null ||
              lateSession !== null || lateFollowedPlan !== null || lateExitReason !== null

            if (hasAnyLate) {
              // Fetch existing row to avoid overwriting already-set fields
              supabase
                .from('trades')
                .select('emotion_tag, execution_score, session, followed_plan, exit_reason')
                .eq('id', session.last_trade_id)
                .eq('user_id', user.id)
                .single()
                .then(({ data: existing, error: fetchErr }) => {
                  if (fetchErr || !existing) return
                  const patch: Record<string, unknown> = {}
                  if (lateEmotion !== null && existing.emotion_tag == null) patch.emotion_tag = lateEmotion
                  if (lateExecution !== null && existing.execution_score == null) patch.execution_score = lateExecution
                  if (lateSession !== null && existing.session == null) patch.session = lateSession
                  if (lateFollowedPlan !== null && existing.followed_plan == null) patch.followed_plan = lateFollowedPlan
                  if (lateExitReason !== null && existing.exit_reason == null) patch.exit_reason = lateExitReason
                  if (Object.keys(patch).length === 0) return
                  supabase
                    .from('trades')
                    .update(patch)
                    .eq('id', session.last_trade_id!)
                    .eq('user_id', user.id)
                    .then(({ error }) => {
                      if (error) console.error('[buddy] late patch failed:', error)
                      else console.log('[buddy] late patch applied:', Object.keys(patch), 'on trade:', session.last_trade_id)
                    })
                })
            }
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
