import OpenAI, { toFile } from 'openai'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// Whisper-1 known hallucinations on near-silent audio
const HALLUCINATION_PATTERNS = [
  /^thank you\.?$/i,
  /^thanks\.?$/i,
  /^you\.?$/i,
  /^\.+$/,
  /^,$/,
  /^!$/,
  /^\s*$/,
]

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'STT not configured' }, { status: 503 })

    const formData = await request.formData()
    const audioFile = formData.get('audio') as File | null
    const mimeType = formData.get('mimeType') as string | null

    if (!audioFile || audioFile.size === 0) {
      return NextResponse.json({ error: 'No audio data' }, { status: 400 })
    }

    // 25MB Whisper limit — 2-5s chunks are ~10-80KB so this is a safety net only
    if (audioFile.size > 25 * 1024 * 1024) {
      return NextResponse.json({ error: 'Audio too large' }, { status: 413 })
    }

    const mime = mimeType || audioFile.type || 'audio/webm'
    let ext = 'webm'
    if (mime.includes('ogg')) ext = 'ogg'
    else if (mime.includes('mp4')) ext = 'mp4'

    const arrayBuffer = await audioFile.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const openai = new OpenAI({ apiKey })

    // toFile() wraps buffer as File-like — required by OpenAI SDK v6
    const file = await toFile(buffer, `audio.${ext}`, { type: mime })

    const transcription = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      language: 'en',
    })

    const text = transcription.text.trim()

    // Filter hallucinations
    const isHallucination = HALLUCINATION_PATTERNS.some(p => p.test(text)) || text.length < 2
    if (isHallucination) {
      return NextResponse.json({ transcript: '' })
    }

    return NextResponse.json({ transcript: text })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    console.error('[stt] error:', msg)
    return NextResponse.json({ error: 'STT failed' }, { status: 500 })
  }
}
