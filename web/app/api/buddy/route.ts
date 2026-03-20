import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import type { TradeRecord, ExtractedData, ChatMessage, EmotionTag } from '@/types/trade'
import { runExtractor } from './agents/extractor'
import { runContext } from './agents/context'
import { runAnalyst } from './agents/analyst'
import { runBuddy } from './agents/buddy'
import { getISOOffset, getTodayInTz, nowInTz } from './timezone'

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

type ConversationState =
  | 'idle'
  | 'awaiting_trade_confirmation'
  | 'awaiting_entry_time'
  | 'awaiting_missing_fields'
  | 'awaiting_emotion_confirmation'
  | 'awaiting_execution_score'

interface SessionState {
  state: ConversationState
  pending_trade_data: Partial<TradeRecord>
  off_topic_count: number
  screenshot_eligible: boolean
  messages: ChatMessage[]
}

// ------------------------------------------------------------------
// Defaults
// ------------------------------------------------------------------

function defaultSession(): SessionState {
  return {
    state: 'idle',
    pending_trade_data: {},
    off_topic_count: 0,
    screenshot_eligible: false,
    messages: [],
  }
}

// ------------------------------------------------------------------
// mergeExtracted — never overwrites with null, only adds
// ------------------------------------------------------------------

function mergeExtracted(
  existing: Partial<TradeRecord>,
  extracted: ExtractedData
): Partial<TradeRecord> {
  const result = { ...existing }
  if (extracted.instrument != null) result.instrument = extracted.instrument
  if (extracted.direction != null) result.direction = extracted.direction
  if (extracted.pnl != null) result.pnl = extracted.pnl
  if (extracted.opened_at != null) result.opened_at = extracted.opened_at
  if (extracted.closed_at != null) result.closed_at = extracted.closed_at
  if (extracted.entry_price != null) result.entry_price = extracted.entry_price
  if (extracted.exit_price != null) result.exit_price = extracted.exit_price
  if (extracted.stop_loss != null) result.stop_loss = extracted.stop_loss
  if (extracted.position_size != null) result.position_size = extracted.position_size
  if (extracted.emotion != null) result.emotion_tag = extracted.emotion as EmotionTag
  if (extracted.execution_score != null) result.execution_score = extracted.execution_score
  if (extracted.followed_plan != null) result.followed_plan = extracted.followed_plan
  return result
}

// ------------------------------------------------------------------
// isReadyToSave — four fields must be present
// ------------------------------------------------------------------

function isReadyToSave(pending: Partial<TradeRecord>): boolean {
  return (
    pending.instrument != null &&
    pending.pnl != null &&
    pending.emotion_tag != null &&
    pending.execution_score != null
  )
}

// ------------------------------------------------------------------
// nextState — pure deterministic logic, no AI judgment
// ------------------------------------------------------------------

function nextState(
  session: SessionState,
  extracted: ExtractedData,
  pending: Partial<TradeRecord>
): SessionState {
  const s = session.state

  const somethingExtracted =
    extracted.has_trade ||
    extracted.instrument !== null ||
    extracted.pnl !== null ||
    extracted.opened_at !== null ||
    extracted.entry_price !== null ||
    extracted.exit_price !== null ||
    extracted.direction !== null ||
    extracted.emotion !== null ||
    extracted.execution_score !== null ||
    extracted.confirmed ||
    extracted.declined

  const offTopicCount = somethingExtracted ? 0 : s === 'idle' ? 0 : session.off_topic_count + 1

  // Abandonment: 2 consecutive off-topic messages in any awaiting state
  if (s !== 'idle' && offTopicCount >= 2) {
    return { ...session, state: 'idle', pending_trade_data: {}, off_topic_count: 0, screenshot_eligible: false }
  }

  if (s === 'idle') {
    if (extracted.has_trade) {
      return { ...session, state: 'awaiting_trade_confirmation', pending_trade_data: pending, off_topic_count: 0 }
    }
    return { ...session, pending_trade_data: pending, off_topic_count: 0 }
  }

  if (s === 'awaiting_trade_confirmation') {
    if (extracted.confirmed) {
      return { ...session, state: 'awaiting_entry_time', pending_trade_data: pending, off_topic_count: 0 }
    }
    if (extracted.declined) {
      return { ...session, state: 'idle', pending_trade_data: {}, off_topic_count: 0 }
    }
    return { ...session, pending_trade_data: pending, off_topic_count: offTopicCount }
  }

  if (s === 'awaiting_entry_time') {
    if (pending.opened_at != null) {
      return { ...session, state: 'awaiting_missing_fields', pending_trade_data: pending, off_topic_count: 0 }
    }
    return { ...session, pending_trade_data: pending, off_topic_count: offTopicCount }
  }

  if (s === 'awaiting_missing_fields') {
    if (extracted.entry_price !== null || extracted.confirmed || extracted.declined) {
      const screenshotEligible = !!(pending.entry_price && pending.exit_price && pending.direction)
      return { ...session, state: 'awaiting_emotion_confirmation', pending_trade_data: pending, off_topic_count: 0, screenshot_eligible: screenshotEligible }
    }
    return { ...session, pending_trade_data: pending, off_topic_count: offTopicCount }
  }

  if (s === 'awaiting_emotion_confirmation') {
    if (pending.emotion_tag != null) {
      return { ...session, state: 'awaiting_execution_score', pending_trade_data: pending, off_topic_count: 0 }
    }
    return { ...session, pending_trade_data: pending, off_topic_count: offTopicCount }
  }

  if (s === 'awaiting_execution_score') {
    if (pending.execution_score != null) {
      return { ...session, state: 'idle', pending_trade_data: {}, off_topic_count: 0, screenshot_eligible: false }
    }
    return { ...session, pending_trade_data: pending, off_topic_count: offTopicCount }
  }

  return { ...session, pending_trade_data: pending, off_topic_count: 0 }
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
          state: (raw.state as ConversationState) ?? 'idle',
          pending_trade_data: (raw.pending_trade_data as Partial<TradeRecord>) ?? {},
          off_topic_count: (raw.off_topic_count as number) ?? 0,
          screenshot_eligible: (raw.screenshot_eligible as boolean) ?? false,
          messages: (raw.messages as ChatMessage[]) ?? [],
        }
      } catch {
        session = defaultSession()
      }
    }

    console.log('[buddy] state:', session.state, '| pending:', JSON.stringify(session.pending_trade_data))

    // Step 2: Extractor + Context in parallel
    const [extracted, context] = await Promise.all([
      runExtractor(message, tradingTimezone),
      runContext(user.id, tradingTimezone),
    ])

    // Step 3: Merge extracted into pending
    const pending = mergeExtracted(session.pending_trade_data, extracted)

    // Step 4: State transition
    const newSession = nextState(session, extracted, pending)

    // Step 5: Analyst — only when there's trade activity
    const shouldRunAnalyst = extracted.has_trade || context.todaysTradeCount >= 3
    const analysis = shouldRunAnalyst
      ? await runAnalyst(extracted, context, pending)
      : null

    // Step 6: Buddy — plain text reply
    const reply = await runBuddy({
      state: newSession.state,
      pending: newSession.pending_trade_data,
      extracted,
      context,
      analysis,
      messages: session.messages,
      user: {
        buddy_name: (profile?.buddy_name as string | null) ?? 'Brew',
        buddy_personality: (profile?.buddy_personality as string | null) ?? 'Friendly Mentor',
        trading_timezone: tradingTimezone,
      },
      currentMessage: message,
    })

    // Step 7: Update message history — clear after save to prevent context bleed
    const shouldSaveTrade = isReadyToSave(pending)
    const updatedMessages: ChatMessage[] = shouldSaveTrade
      ? []
      : [
          ...session.messages,
          { role: 'user' as const, content: message },
          { role: 'assistant' as const, content: reply },
        ].slice(-10)

    // Step 8: Save trade if ready
    let savedTrade = null
    if (shouldSaveTrade) {
      console.log('[buddy] SAVING TRADE:', JSON.stringify(pending, null, 2))
      try {
        const closedAt = pending.closed_at ?? nowInTz(tradingTimezone)
        const incomplete = !pending.opened_at || !pending.closed_at || !pending.direction

        const { data: insertedTrade, error: insertError } = await supabase
          .from('trades')
          .insert({
            user_id: user.id,
            instrument: pending.instrument ?? '',
            direction: pending.direction ?? null,
            entry_price: pending.entry_price ?? null,
            exit_price: pending.exit_price ?? null,
            stop_loss: pending.stop_loss ?? null,
            pnl: pending.pnl ?? null,
            position_size: pending.position_size ?? null,
            opened_at: pending.opened_at ?? null,
            closed_at: closedAt,
            emotion_tag: pending.emotion_tag ?? null,
            execution_score: pending.execution_score ?? null,
            notes: pending.notes ?? null,
            followed_plan: pending.followed_plan ?? null,
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
        }
      } catch (e) {
        console.error('[buddy] trade save exception:', e)
      }
    }

    // Step 9: Persist session state
    const finalSession: SessionState = shouldSaveTrade
      ? { state: 'idle', pending_trade_data: {}, off_topic_count: 0, screenshot_eligible: false, messages: [] }
      : { ...newSession, messages: updatedMessages }

    const sessionPayload = {
      state: finalSession.state,
      pending_trade_data: finalSession.pending_trade_data,
      off_topic_count: finalSession.off_topic_count,
      screenshot_eligible: finalSession.screenshot_eligible,
      messages: finalSession.messages,
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
      reply,
      action: shouldSaveTrade ? 'save_trade' : null,
      trade_data: savedTrade,
      screenshot_eligible: finalSession.screenshot_eligible,
    })

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    console.error('[buddy] orchestrator error:', msg)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
