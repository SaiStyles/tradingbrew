import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import type { TradeRecord, EmotionTag } from '@/types/trade'

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

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface SessionState {
  state: ConversationState
  pending_trade_data: Partial<TradeRecord>
  off_topic_count: number
  screenshot_eligible: boolean
  messages: ChatMessage[]
}

// What Claude extracts — Claude never decides state
interface ClaudeExtracted {
  instrument: string | null
  direction: 'long' | 'short' | null
  pnl: number | null
  opened_at: string | null
  closed_at: string | null
  entry_price: number | null
  exit_price: number | null
  stop_loss: number | null
  position_size: number | null
  emotion: string | null
  execution_score: number | null
  followed_plan: boolean | null
  confirmed: boolean
  declined: boolean
}

interface ClaudeResponse {
  reply: string
  extracted: ClaudeExtracted
}

// ------------------------------------------------------------------
// Timezone helpers — never use server timezone, always use trader's tz
// ------------------------------------------------------------------

function getISOOffset(timezone: string): string {
  const now = new Date()
  // Compare what the clock says in the target tz vs UTC to get the offset
  const tzStr = now.toLocaleString('en-US', { timeZone: timezone })
  const utcStr = now.toLocaleString('en-US', { timeZone: 'UTC' })
  const diffMs = new Date(tzStr).getTime() - new Date(utcStr).getTime()
  const diffMins = Math.round(diffMs / 60000)
  const sign = diffMins >= 0 ? '+' : '-'
  const abs = Math.abs(diffMins)
  const h = String(Math.floor(abs / 60)).padStart(2, '0')
  const m = String(abs % 60).padStart(2, '0')
  return `${sign}${h}:${m}`
}

function getTodayInTz(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date()) // Returns YYYY-MM-DD
}

// ------------------------------------------------------------------
// Defaults
// ------------------------------------------------------------------

function defaultSessionState(): SessionState {
  return {
    state: 'idle',
    pending_trade_data: {},
    off_topic_count: 0,
    screenshot_eligible: false,
    messages: [],
  }
}

// ------------------------------------------------------------------
// Merge extracted fields into pending trade data
// Only overwrite if new value is not null — never lose prior data
// ------------------------------------------------------------------

function mergeExtracted(
  pending: Partial<TradeRecord>,
  extracted: ClaudeExtracted
): Partial<TradeRecord> {
  // Build only the fields Claude actually provided (not null, not undefined)
  // Then spread over existing pending — never loses prior data
  const mapped: Partial<TradeRecord> = {}
  if (extracted.instrument != null) mapped.instrument = extracted.instrument
  if (extracted.direction != null) mapped.direction = extracted.direction
  if (extracted.pnl != null) mapped.pnl = extracted.pnl
  if (extracted.opened_at != null) mapped.opened_at = extracted.opened_at
  if (extracted.closed_at != null) mapped.closed_at = extracted.closed_at
  if (extracted.entry_price != null) mapped.entry_price = extracted.entry_price
  if (extracted.exit_price != null) mapped.exit_price = extracted.exit_price
  if (extracted.stop_loss != null) mapped.stop_loss = extracted.stop_loss
  if (extracted.position_size != null) mapped.position_size = extracted.position_size
  if (extracted.emotion != null) mapped.emotion_tag = extracted.emotion as EmotionTag
  if (extracted.execution_score != null) mapped.execution_score = extracted.execution_score
  if (extracted.followed_plan != null) mapped.followed_plan = extracted.followed_plan
  return { ...pending, ...mapped }
}

// ------------------------------------------------------------------
// Deterministic state transition — our code owns this, not Claude
// ------------------------------------------------------------------

function nextState(
  current: SessionState,
  extracted: ClaudeExtracted,
  currentMessages: ChatMessage[]
): SessionState {
  const pending = mergeExtracted(current.pending_trade_data, extracted)
  const s = current.state
  const msgs = currentMessages

  // Detect off-topic: nothing useful extracted and no confirm/decline
  const somethingExtracted =
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

  const offTopicCount = somethingExtracted
    ? 0
    : s === 'idle'
    ? 0
    : current.off_topic_count + 1

  // Abandonment — 2 off-topic messages in any awaiting state
  if (s !== 'idle' && offTopicCount >= 2) {
    return { state: 'idle', pending_trade_data: {}, off_topic_count: 0, screenshot_eligible: false, messages: msgs }
  }

  if (s === 'idle') {
    if (extracted.instrument && extracted.pnl !== null) {
      return { state: 'awaiting_trade_confirmation', pending_trade_data: pending, off_topic_count: 0, screenshot_eligible: false, messages: msgs }
    }
    return { state: 'idle', pending_trade_data: pending, off_topic_count: 0, screenshot_eligible: false, messages: msgs }
  }

  if (s === 'awaiting_trade_confirmation') {
    if (extracted.confirmed) {
      return { state: 'awaiting_entry_time', pending_trade_data: pending, off_topic_count: 0, screenshot_eligible: false, messages: msgs }
    }
    if (extracted.declined) {
      return { state: 'idle', pending_trade_data: {}, off_topic_count: 0, screenshot_eligible: false, messages: msgs }
    }
    return { state: 'awaiting_trade_confirmation', pending_trade_data: pending, off_topic_count: offTopicCount, screenshot_eligible: false, messages: msgs }
  }

  if (s === 'awaiting_entry_time') {
    if (extracted.opened_at || extracted.confirmed) {
      return { state: 'awaiting_missing_fields', pending_trade_data: pending, off_topic_count: 0, screenshot_eligible: false, messages: msgs }
    }
    return { state: 'awaiting_entry_time', pending_trade_data: pending, off_topic_count: offTopicCount, screenshot_eligible: false, messages: msgs }
  }

  if (s === 'awaiting_missing_fields') {
    // ALWAYS go to emotion — never skip to execution_score
    // Use pending (accumulated) not extracted (just this message) for screenshotEligible
    const screenshotEligible = !!(pending.entry_price && pending.exit_price && pending.direction)
    return { state: 'awaiting_emotion_confirmation', pending_trade_data: pending, off_topic_count: 0, screenshot_eligible: screenshotEligible, messages: msgs }
  }

  if (s === 'awaiting_emotion_confirmation') {
    if (extracted.confirmed || extracted.emotion || extracted.declined) {
      return { state: 'awaiting_execution_score', pending_trade_data: pending, off_topic_count: 0, screenshot_eligible: current.screenshot_eligible, messages: msgs }
    }
    return { state: 'awaiting_emotion_confirmation', pending_trade_data: pending, off_topic_count: offTopicCount, screenshot_eligible: current.screenshot_eligible, messages: msgs }
  }

  if (s === 'awaiting_execution_score') {
    // Use != null (loose) so undefined does NOT trigger this — only an actual number does
    if (extracted.execution_score != null) {
      return { state: 'idle', pending_trade_data: {}, off_topic_count: 0, screenshot_eligible: false, messages: msgs }
    }
    return { state: 'awaiting_execution_score', pending_trade_data: pending, off_topic_count: offTopicCount, screenshot_eligible: current.screenshot_eligible, messages: msgs }
  }

  return { state: 'idle', pending_trade_data: pending, off_topic_count: 0, screenshot_eligible: false, messages: msgs }
}

// ------------------------------------------------------------------
// System prompt — Claude extracts + replies, never transitions state
// ------------------------------------------------------------------

function buildSystemPrompt(
  buddyName: string,
  buddyPersonality: string,
  traderName: string,
  tradingStyle: string,
  tradeCount: number,
  todayPnL: number,
  rules: Array<{ rule_type: string; value: number }>,
  session: SessionState,
  tradingTimezone: string
): string {
  const tzOffset = getISOOffset(tradingTimezone)
  const todayDate = getTodayInTz(tradingTimezone)
  return `You are ${buddyName}, an AI trading buddy for ${traderName}. Personality: ${buddyPersonality}.

Be warm, sharp, never clinical. Speak like a trusted senior trader friend. Never give financial advice or signals. Never say "I have logged" or "state updated". Never reference memory directly.

TRADER'S TIMEZONE: ${tradingTimezone} (UTC offset today: ${tzOffset})
TODAY'S DATE IN TRADER'S TIMEZONE: ${todayDate} — use this exact date when constructing opened_at or closed_at.

TRADER CONTEXT:
- Trading style: ${tradingStyle}
- Today's trades: ${tradeCount}
- Today's P&L: $${todayPnL.toFixed(2)}
- Active rules: ${rules.map(r => `${r.rule_type}: ${r.value}`).join(', ') || 'none set'}

CURRENT STATE: ${session.state}
TRADE DATA SO FAR: ${JSON.stringify(session.pending_trade_data)}

YOUR JOB BASED ON CURRENT STATE:

idle → Have a natural conversation. If the user describes a trade, extract what you can.

awaiting_trade_confirmation → You just extracted a trade. Confirm the key details back naturally and ask if that's right. Example: "Got it — NQ long, +$300. That right?"

awaiting_entry_time → Trade confirmed. Casually ask what time they entered.

awaiting_missing_fields → Ask once if they want to add entry price, exit price and direction so you can capture their chart. Make it sound useful, not like a form.

awaiting_emotion_confirmation → Infer the emotion from everything said so far. Confirm naturally. Example: "Sounds like confidence on that one — fair?"

awaiting_execution_score → Ask them to rate their execution 1 to 10. One casual question.

RETURN ONLY this strict JSON. No extra text, no markdown fences, no backticks:

{"reply":"what you say to the trader","extracted":{"instrument":null,"direction":null,"pnl":null,"opened_at":null,"closed_at":null,"entry_price":null,"exit_price":null,"stop_loss":null,"position_size":null,"emotion":null,"execution_score":null,"followed_plan":null,"confirmed":false,"declined":false}}

Rules for extracted fields:
- Only populate fields the user actually mentioned in THIS message
- confirmed: true if user is agreeing/confirming in context — use judgment not keyword matching
- declined: true if user is disagreeing, skipping, or saying they don't know
- opened_at/closed_at: format EXACTLY as "YYYY-MM-DDTHH:MM:00{tzOffset}" using the trader's UTC offset above. Example for UTC-5: "2026-03-20T09:42:00-05:00". Always append the offset. Never use Z. Never use +00:00 unless trader's timezone is UTC.
- emotion must be one of: confident, hesitant, FOMO, revenge, bored, calm, frustrated, euphoric`
}

// ------------------------------------------------------------------
// Route handler
// ------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      console.error('ANTHROPIC_API_KEY is not set')
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const anthropic = new Anthropic({ apiKey })
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body: unknown = await request.json()
    if (
      typeof body !== 'object' ||
      body === null ||
      !('message' in body) ||
      typeof (body as Record<string, unknown>).message !== 'string'
    ) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }
    const { message } = body as { message: string }

    // Load everything in parallel
    const [profileResult, tradesResult, rulesResult, sessionResult] = await Promise.all([
      supabase.from('users').select('*').eq('id', user.id).single(),
      supabase.from('trades').select('pnl').eq('user_id', user.id).gte('created_at', new Date().toISOString().split('T')[0]),
      supabase.from('rules').select('rule_type, value').eq('user_id', user.id).eq('is_active', true),
      supabase
        .schema('public')
        .from('sessions')
        .select('id, conversation_state')
        .eq('user_id', user.id)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    const profile = profileResult.data
    const todayTrades = tradesResult.data ?? []
    const rules: Array<{ rule_type: string; value: number }> = rulesResult.data ?? []
    const todayPnL = todayTrades.reduce((sum, t) => sum + (Number(t.pnl) || 0), 0)

    // Parse session state
    let session: SessionState = defaultSessionState()
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
        session = defaultSessionState()
      }
    }

    console.log('[buddy] state:', session.state, '| pending:', JSON.stringify(session.pending_trade_data))

    // Build message history: prior exchanges + current user message
    // Cast role explicitly — Supabase returns jsonb fields as unknown
    const historyWithCurrent: ChatMessage[] = [
      ...session.messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user' as const, content: message },
    ]

    // Call Claude — only for natural language + extraction
    const claudeResult = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: buildSystemPrompt(
        profile?.buddy_name ?? 'Brew',
        profile?.buddy_personality ?? 'Friendly Mentor',
        profile?.name ?? 'trader',
        profile?.trading_style ?? 'unknown',
        todayTrades.length,
        todayPnL,
        rules,
        session,
        profile?.trading_timezone ?? 'America/New_York'
      ),
      // Prefill forces Claude to start the JSON object — no markdown wrapping possible
      messages: [...historyWithCurrent, { role: 'assistant' as const, content: '{' }],
    })

    // Prepend the prefill '{' back since Claude continues from it
    const continuation = claudeResult.content[0].type === 'text' ? claudeResult.content[0].text : ''
    const rawText = '{' + continuation

    // Parse Claude's response
    let parsed: ClaudeResponse
    try {
      // Strip markdown fences as fallback in case they still appear
      const cleaned = rawText
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim()
      parsed = JSON.parse(cleaned) as ClaudeResponse
    } catch {
      console.log('[buddy] Claude raw:', rawText)
      // Fallback: treat as plain reply, no extraction, stay in current state
      parsed = {
        reply: "Something went wrong on my end.",
        extracted: {
          instrument: null, direction: null, pnl: null, opened_at: null, closed_at: null,
          entry_price: null, exit_price: null, stop_loss: null, position_size: null,
          emotion: null, execution_score: null, followed_plan: null,
          confirmed: false, declined: false,
        },
      }
    }

    // Our code decides the next state deterministically
    const prevState = session.state
    const newSession = nextState(session, parsed.extracted, historyWithCurrent)
    const shouldSaveTrade = prevState === 'awaiting_execution_score' && newSession.state === 'idle'

    // Save trade if flow completed
    let savedTrade: TradeRecord | null = null
    if (shouldSaveTrade) {
      // Use pending from BEFORE the state transition (newSession cleared it)
      const tradeToSave = mergeExtracted(session.pending_trade_data, parsed.extracted)
      // ISSUE 2: Confirm all fields present before save
      console.log('[buddy] SAVING TRADE:', JSON.stringify(tradeToSave, null, 2))
      try {
        // ISSUE 6: entry_price/exit_price are optional — only opened_at, closed_at, direction matter
      const incomplete =
          !tradeToSave.opened_at ||
          !tradeToSave.closed_at ||
          !tradeToSave.direction

        const { data: insertedTrade, error: insertError } = await supabase
          .from('trades')
          .insert({
            user_id: user.id,
            instrument: tradeToSave.instrument ?? '',
            direction: tradeToSave.direction ?? null,
            entry_price: tradeToSave.entry_price ?? null,
            exit_price: tradeToSave.exit_price ?? null,
            stop_loss: tradeToSave.stop_loss ?? null,
            pnl: tradeToSave.pnl ?? null,
            position_size: tradeToSave.position_size ?? null,
            opened_at: tradeToSave.opened_at ?? null,
            // Use trader's timezone offset — never server UTC
            closed_at: tradeToSave.closed_at ?? (() => {
              const tz = profile?.trading_timezone ?? 'America/New_York'
              const offset = getISOOffset(tz)
              const todayDt = getTodayInTz(tz)
              const now = new Date()
              const pad = (x: number) => String(x).padStart(2, '0')
              const localStr = now.toLocaleString('en-US', { timeZone: tz, hour12: false })
              const d = new Date(localStr)
              return `${todayDt}T${pad(d.getHours())}:${pad(d.getMinutes())}:00${offset}`
            })(),
            emotion_tag: tradeToSave.emotion_tag ?? null,
            execution_score: tradeToSave.execution_score ?? null,
            notes: tradeToSave.notes ?? null,
            followed_plan: tradeToSave.followed_plan ?? null,
            incomplete,
            deleted_at: null,
          })
          .select()
          .single()

        if (insertError) {
          console.log('[buddy] trade save error:', insertError)
        } else {
          console.log('[buddy] trade save response: 200', JSON.stringify(insertedTrade))
          savedTrade = insertedTrade as TradeRecord
        }
      } catch (e) {
        console.log('[buddy] trade save error:', e)
      }
    } else {
      console.log('[buddy] save_trade NOT triggered — prevState:', prevState, '| newState:', newSession.state)
    }

    // Update message history: append assistant reply, keep last 10 only
    // ISSUE 5: If trade just saved, reset history — prevents context bleed into next trade
    const updatedMessages: ChatMessage[] = shouldSaveTrade
      ? []
      : [
          ...historyWithCurrent,
          { role: 'assistant' as const, content: parsed.reply },
        ].slice(-10)

    // Persist updated session state
    const sessionPayload = {
      state: newSession.state,
      pending_trade_data: newSession.pending_trade_data,
      off_topic_count: newSession.off_topic_count,
      screenshot_eligible: newSession.screenshot_eligible,
      messages: updatedMessages,
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

    return NextResponse.json({
      reply: parsed.reply,
      action: shouldSaveTrade ? 'save_trade' : null,
      trade_data: savedTrade,
      screenshot_eligible: newSession.screenshot_eligible,
    })

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    console.error('Buddy API error:', msg)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
