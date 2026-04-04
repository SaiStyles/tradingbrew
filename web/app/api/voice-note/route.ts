import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

const BUCKET = 'trade-voice-notes'
const MAX_SIZE = 25 * 1024 * 1024 // 25 MB

// ------------------------------------------------------------------
// POST /api/voice-note  (FormData: file, trade_id)
// ------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const tradeId = formData.get('trade_id') as string | null

    if (!file || !tradeId) {
      return NextResponse.json({ error: 'file and trade_id required' }, { status: 400 })
    }

    // Validate ownership
    const { data: trade, error: tradeErr } = await supabase
      .from('trades')
      .select('id, voice_note_url')
      .eq('id', tradeId)
      .eq('user_id', user.id)
      .single()

    if (tradeErr || !trade) {
      return NextResponse.json({ error: 'Trade not found' }, { status: 404 })
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File must be under 25 MB' }, { status: 422 })
    }

    // Delete existing voice note if present
    if (trade.voice_note_url) {
      const oldPath = trade.voice_note_url.split(`${BUCKET}/`)[1]
      if (oldPath) {
        await supabase.storage.from(BUCKET).remove([oldPath])
      }
    }

    const mimeBase = file.type.split(';')[0].trim()
    const ext = mimeBase.includes('ogg') ? 'ogg'
      : mimeBase.includes('wav') ? 'wav'
      : mimeBase.includes('mp4') || mimeBase.includes('m4a') || mimeBase.includes('mpeg') ? 'mp4'
      : 'webm'

    const storagePath = `${user.id}/${tradeId}/voice-${Date.now()}.${ext}`
    const bytes = await file.arrayBuffer()

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, bytes, { contentType: mimeBase, upsert: false })

    if (uploadError) {
      console.error('[voice-note] upload error:', uploadError)
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
    }

    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(storagePath)

    const { error: updateError } = await supabase
      .from('trades')
      .update({ voice_note_url: publicUrl })
      .eq('id', tradeId)
      .eq('user_id', user.id)

    if (updateError) {
      await supabase.storage.from(BUCKET).remove([storagePath])
      return NextResponse.json({ error: 'Failed to save voice note' }, { status: 500 })
    }

    return NextResponse.json({ url: publicUrl }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}

// ------------------------------------------------------------------
// DELETE /api/voice-note?trade_id=xxx
// ------------------------------------------------------------------
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const tradeId = request.nextUrl.searchParams.get('trade_id')
    if (!tradeId) return NextResponse.json({ error: 'trade_id required' }, { status: 400 })

    const { data: trade, error: tradeErr } = await supabase
      .from('trades')
      .select('id, voice_note_url')
      .eq('id', tradeId)
      .eq('user_id', user.id)
      .single()

    if (tradeErr || !trade) {
      return NextResponse.json({ error: 'Trade not found' }, { status: 404 })
    }

    if (trade.voice_note_url) {
      const storagePath = trade.voice_note_url.split(`${BUCKET}/`)[1]
      if (storagePath) {
        await supabase.storage.from(BUCKET).remove([storagePath])
      }
    }

    await supabase
      .from('trades')
      .update({ voice_note_url: null })
      .eq('id', tradeId)
      .eq('user_id', user.id)

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
