import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!
})

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { message } = await request.json()

    const { data: profile } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single()

    const { data: todayTrades } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', user.id)
      .gte('created_at', new Date().toISOString().split('T')[0])

    const { data: rules } = await supabase
      .from('rules')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)

    const todayPnL = todayTrades?.reduce((sum, t) => sum + (t.pnl || 0), 0) || 0
    const tradeCount = todayTrades?.length || 0

    const systemPrompt = `You are ${profile?.buddy_name || 'Brew'}, an AI trading companion for ${profile?.name || 'the trader'}.

PERSONALITY:
- Warm, supportive, never judgmental
- Speak like a trusted senior trader friend
- Keep responses concise and conversational
- Never give financial advice or signals
- Never reference memory directly — make trader FEEL understood not watched

TRADER CONTEXT:
- Trading style: ${profile?.trading_style || 'unknown'}
- Today's trades: ${tradeCount}
- Today's P&L: $${todayPnL.toFixed(2)}
- Active rules: ${rules?.map(r => `${r.rule_type}: ${r.value}`).join(', ') || 'none set'}

RULES:
- Never say "I remember you said..."
- Never give signals or financial advice
- Always empathy first, analysis second
- Keep responses under 3 sentences unless asked for more
- Be proactive and ask follow up questions`

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: 'user', content: message }]
    })

    const reply = response.content[0].type === 'text' ? response.content[0].text : ''

    return NextResponse.json({ reply })

  } catch (error) {
    console.error('Buddy API error:', error)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}