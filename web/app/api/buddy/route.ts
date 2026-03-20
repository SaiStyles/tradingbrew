import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import type { TradeRecord } from '@/types/trade'

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

interface SessionConversationState {
  state: ConversationState
  pending_trade_data: Partial<TradeRecord>
}

interface ClaudeResponse {
  reply: string
  new_state: ConversationState
  pending_trade_data: Partial<TradeRecord>
  action: 'save_trade' | null
  trade_data: Partial<TradeRecord> | null
  screenshot_eligible: boolean
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function defaultConversationState(): SessionConversationState {
  return { state: 'idle', pending_trade_data: {} }
}

function buildSystemPrompt(
  buddyName: string,
  traderName: string,
  tradingStyle: string,
  tradeCount: number,
  todayPnL: number,
  rules: Array<{ rule_type: string; value: number }>,
  conversationState: SessionConversationState
): string {
  return `You are ${buddyName}, an AI trading companion for ${traderName}.

PERSONALITY:
- Warm, supportive, never judgmental
- Speak like a trusted senior trader friend
- Keep responses concise and conversational (under 3 sentences unless asking multi-part questions)
- Never give financial advice or signals
- Never reference memory directly — make the trader FEEL understood, not watched
- Never say "I remember you said..."
- Always empathy first, analysis second

TRADER CONTEXT:
- Trading style: ${tradingStyle}
- Today's trades: ${tradeCount}
- Today's P&L: $${todayPnL.toFixed(2)}
- Active rules: ${rules.map(r => `${r.rule_type}: ${r.value}`).join(', ') || 'none set'}

CURRENT CONVERSATION STATE: ${conversationState.state}
PENDING TRADE DATA: ${JSON.stringify(conversationState.pending_trade_data)}

TRADE CAPTURE STATE MACHINE — follow this exactly:

STATE: idle
- Listen for any mention of a trade (instrument, PnL, win/loss, direction)
- If a trade is detected: extract all fields you can (instrument, direction, pnl, entry_price, exit_price, position_size)
- Move to: awaiting_trade_confirmation
- Example reply: "Got it — NQ long, +$300. That right?"

STATE: awaiting_trade_confirmation
- If user says yes/correct/right/yep/yup → move to awaiting_entry_time
- Ask: "What time did you enter?"
- If user says no/wrong/incorrect → ask for corrections, stay in awaiting_trade_confirmation
- If user changes subject → save what we have with incomplete: true, return to idle

STATE: awaiting_entry_time
- Extract specific time ("at 9:42") → set opened_at
- Calculate from duration ("was in 20 mins") → use closed_at - duration for opened_at
- "don't know" or similar → set opened_at: null, mark incomplete: true
- After extracting (or noting unknown) → if entry_price or exit_price or direction is missing, move to awaiting_missing_fields
- If all present → move to awaiting_emotion_confirmation
- Ask for emotion: "Sounds like [inferred emotion] — fair?"

STATE: awaiting_missing_fields
- Ask ONCE: "Want to add entry, exit and direction so I can capture your chart?"
- If yes → collect the missing fields, then move to awaiting_emotion_confirmation
- If no → move to awaiting_emotion_confirmation with what we have, mark incomplete: true
- Infer emotion and ask: "Sounds like [emotion] — fair?"

STATE: awaiting_emotion_confirmation
- If user confirms emotion → set emotion_tag, move to awaiting_execution_score
- If user provides different emotion → set that emotion, move to awaiting_execution_score
- Ask: "Rate your execution 1 to 10?"

STATE: awaiting_execution_score
- Extract number 1-10 from response
- Set execution_score, set action: "save_trade"
- Move to: idle
- Set trade_data to the complete trade object

ABANDONMENT RULE:
- If the trader changes subject mid-flow (any state other than idle) → save what we have with incomplete: true, return to idle

EMOTION INFERENCE:
- Use context clues: fast profit → euphoric, revenge trading → FOMO/revenge, slow careful entry → calm, hesitation → hesitant
- Valid emotions: confident, hesitant, FOMO, revenge, bored, calm, frustrated, euphoric

TIME HANDLING:
- "at 9:42" / "at 14:30" → set opened_at to today's date + that time (ISO format)
- "I was in for 20 minutes" → if closed_at exists, subtract duration; otherwise note incomplete
- "don't know" / "not sure" / "can't remember" → opened_at: null, mark incomplete: true

CRITICAL — YOU MUST ALWAYS RESPOND WITH VALID JSON ONLY. No text before or after the JSON.

Response format (strict JSON, no markdown fences):
{
  "reply": "your conversational response here",
  "new_state": "idle | awaiting_trade_confirmation | awaiting_entry_time | awaiting_missing_fields | awaiting_emotion_confirmation | awaiting_execution_score",
  "pending_trade_data": { "all collected fields so far" },
  "action": null,
  "trade_data": null,
  "screenshot_eligible": false
}

When action is save_trade, set trade_data to the complete trade object with all collected fields.`
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
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

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

    // Load context in parallel
    const [profileResult, tradesResult, rulesResult, sessionResult] = await Promise.all([
      supabase.from('users').select('*').eq('id', user.id).single(),
      supabase
        .from('trades')
        .select('*')
        .eq('user_id', user.id)
        .gte('created_at', new Date().toISOString().split('T')[0]),
      supabase.from('rules').select('*').eq('user_id', user.id).eq('is_active', true),
      supabase
        .from('sessions')
        .select('conversation_state')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    const profile = profileResult.data
    const todayTrades = tradesResult.data ?? []
    const rules: Array<{ rule_type: string; value: number }> = rulesResult.data ?? []

    // Parse conversation state — fall back to defaults if missing/malformed
    let conversationState: SessionConversationState = defaultConversationState()
    if (sessionResult.data?.conversation_state) {
      try {
        const raw = sessionResult.data.conversation_state as Record<string, unknown>
        conversationState = {
          state: (raw.state as ConversationState) ?? 'idle',
          pending_trade_data: (raw.pending_trade_data as Partial<TradeRecord>) ?? {},
        }
      } catch {
        conversationState = defaultConversationState()
      }
    }

    const todayPnL = todayTrades.reduce((sum, t) => sum + (Number(t.pnl) || 0), 0)
    const tradeCount = todayTrades.length

    const systemPrompt = buildSystemPrompt(
      profile?.buddy_name ?? 'Brew',
      profile?.name ?? 'trader',
      profile?.trading_style ?? 'unknown',
      tradeCount,
      todayPnL,
      rules,
      conversationState
    )

    const claudeResult = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20251001',
      max_tokens: 600,
      system: systemPrompt,
      messages: [{ role: 'user', content: message }],
    })

    const rawText =
      claudeResult.content[0].type === 'text' ? claudeResult.content[0].text.trim() : ''

    // Parse Claude's JSON response
    let parsed: ClaudeResponse
    try {
      // Strip markdown code fences if Claude wraps anyway
      const cleaned = rawText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
      parsed = JSON.parse(cleaned) as ClaudeResponse
    } catch (parseError) {
      console.error('Failed to parse Claude JSON response:', rawText, parseError)
      // Graceful fallback — treat as plain text reply, stay in current state
      parsed = {
        reply: rawText || 'Something went wrong on my end.',
        new_state: conversationState.state,
        pending_trade_data: conversationState.pending_trade_data,
        action: null,
        trade_data: null,
        screenshot_eligible: false,
      }
    }

    // ------------------------------------------------------------------
    // Handle save_trade action
    // ------------------------------------------------------------------
    let savedTrade: TradeRecord | null = null
    if (parsed.action === 'save_trade' && parsed.trade_data) {
      try {
        const tradePayload: Partial<TradeRecord> & { user_id: string } = {
          user_id: user.id,
          instrument: parsed.trade_data.instrument ?? '',
          direction: parsed.trade_data.direction ?? null,
          entry_price: parsed.trade_data.entry_price ?? null,
          exit_price: parsed.trade_data.exit_price ?? null,
          stop_loss: parsed.trade_data.stop_loss ?? null,
          pnl: parsed.trade_data.pnl ?? null,
          position_size: parsed.trade_data.position_size ?? null,
          opened_at: parsed.trade_data.opened_at ?? null,
          closed_at: parsed.trade_data.closed_at ?? null,
          emotion_tag: parsed.trade_data.emotion_tag ?? null,
          execution_score: parsed.trade_data.execution_score ?? null,
          notes: parsed.trade_data.notes ?? null,
          followed_plan: parsed.trade_data.followed_plan ?? null,
          incomplete:
            !parsed.trade_data.opened_at ||
            !parsed.trade_data.direction ||
            !parsed.trade_data.entry_price ||
            !parsed.trade_data.exit_price,
          deleted_at: null,
        }

        const { data: insertedTrade, error: insertError } = await supabase
          .from('trades')
          .insert(tradePayload)
          .select()
          .single()

        if (insertError) {
          console.error('Failed to save trade:', insertError)
        } else {
          savedTrade = insertedTrade as TradeRecord
        }
      } catch (tradeError) {
        console.error('Trade insert error:', tradeError)
      }
    }

    // ------------------------------------------------------------------
    // Persist updated conversation state back to sessions table
    // ------------------------------------------------------------------
    const updatedConversationState: SessionConversationState = {
      state: parsed.new_state,
      pending_trade_data:
        parsed.action === 'save_trade' ? {} : (parsed.pending_trade_data ?? {}),
    }

    try {
      // Upsert — update existing session row or insert if none
      const { data: existingSession } = await supabase
        .from('sessions')
        .select('id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (existingSession?.id) {
        await supabase
          .from('sessions')
          .update({ conversation_state: updatedConversationState })
          .eq('id', existingSession.id)
      } else {
        await supabase.from('sessions').insert({
          user_id: user.id,
          conversation_state: updatedConversationState,
        })
      }
    } catch (sessionError) {
      // Non-fatal — log and continue
      console.error('Failed to persist conversation state:', sessionError)
    }

    return NextResponse.json({
      reply: parsed.reply,
      action: parsed.action,
      trade_data: savedTrade ?? parsed.trade_data,
      screenshot_eligible: parsed.screenshot_eligible,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('Buddy API error:', message)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
