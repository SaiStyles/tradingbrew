import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

const VALID_VOICES = ['alloy', 'echo', 'fable', 'nova', 'onyx', 'shimmer'] as const
type Voice = (typeof VALID_VOICES)[number]

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body: unknown = await request.json()
    if (typeof body !== 'object' || body === null) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }
    const { text, voice } = body as Record<string, unknown>
    const cleanText = typeof text === 'string' ? text.slice(0, 4096) : ''
    if (!cleanText) return NextResponse.json({ error: 'No text' }, { status: 400 })

    const safeVoice: Voice = VALID_VOICES.includes(voice as Voice) ? (voice as Voice) : 'nova'

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'TTS not configured' }, { status: 503 })

    const openai = new OpenAI({ apiKey })
    const mp3 = await openai.audio.speech.create({
      model: 'tts-1',
      voice: safeVoice,
      input: cleanText,
    })

    return new NextResponse(mp3.body, {
      headers: { 'Content-Type': 'audio/mpeg' },
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    console.error('[tts] error:', msg)
    return NextResponse.json({ error: 'TTS failed' }, { status: 500 })
  }
}
