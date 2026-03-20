import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export async function POST(request: NextRequest) {
    console.log('FULL KEY START:', process.env.ANTHROPIC_API_KEY?.substring(0, 20))
  console.log('KEY LENGTH:', process.env.ANTHROPIC_API_KEY?.length)
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      console.error('ANTHROPIC_API_KEY is not set in environment variables')
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

const anthropic = new Anthropic({ apiKey: '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' })

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
- Never reference memory directly

TRADER CONTEXT:
- Trading style: ${profile?.trading_style || 'unknown'}
- Today's trades: ${tradeCount}
- Today's P&L: $${todayPnL.toFixed(2)}
- Active rules: ${rules?.map(r => `${r.rule_type}: ${r.value}`).join(', ') || 'none set'}

RULES:
- Never give signals or financial advice
- Always empathy first, analysis second
- Keep responses under 3 sentences
- Be proactive and ask follow up questions`

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: 'user', content: message }]
    })

    const reply = response.content[0].type === 'text' ? response.content[0].text : ''
    return NextResponse.json({ reply })

  } catch (error: any) {
    console.error('Buddy API error:', error?.message)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}