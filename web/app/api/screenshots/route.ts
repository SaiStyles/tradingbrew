import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

const BUCKET = 'trade-screenshots'
const MAX_SIZE = 5 * 1024 * 1024 // 5 MB
const MAX_PER_TRADE = 6
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']

// ------------------------------------------------------------------
// GET /api/screenshots?trade_id=xxx
// ------------------------------------------------------------------
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const tradeId = request.nextUrl.searchParams.get('trade_id')
    if (!tradeId) return NextResponse.json({ error: 'trade_id required' }, { status: 400 })

    const { data, error } = await supabase
      .from('screenshots')
      .select('id, url, storage_path, created_at')
      .eq('trade_id', tradeId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })

    if (error) return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })

    return NextResponse.json({ screenshots: data ?? [] })
  } catch {
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}

// ------------------------------------------------------------------
// POST /api/screenshots  (FormData: file, trade_id)
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

    // Validate ownership of trade
    const { data: trade, error: tradeErr } = await supabase
      .from('trades')
      .select('id')
      .eq('id', tradeId)
      .eq('user_id', user.id)
      .single()

    if (tradeErr || !trade) {
      return NextResponse.json({ error: 'Trade not found' }, { status: 404 })
    }

    // Validate file
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Only image files are allowed (JPG, PNG, WEBP, GIF)' }, { status: 422 })
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File must be under 5 MB' }, { status: 422 })
    }

    // Enforce per-trade limit
    const { count } = await supabase
      .from('screenshots')
      .select('id', { count: 'exact', head: true })
      .eq('trade_id', tradeId)
      .eq('user_id', user.id)

    if ((count ?? 0) >= MAX_PER_TRADE) {
      return NextResponse.json({ error: `Max ${MAX_PER_TRADE} screenshots per trade` }, { status: 422 })
    }

    // Upload to Supabase Storage
    const ext = file.name.split('.').pop() ?? 'jpg'
    const storagePath = `${user.id}/${tradeId}/${Date.now()}.${ext}`
    const bytes = await file.arrayBuffer()

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, bytes, { contentType: file.type, upsert: false })

    if (uploadError) {
      console.error('[screenshots] storage upload error:', uploadError)
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(storagePath)

    // Save record
    const { data: record, error: insertError } = await supabase
      .from('screenshots')
      .insert({ user_id: user.id, trade_id: tradeId, storage_path: storagePath, url: publicUrl })
      .select('id, url, storage_path, created_at')
      .single()

    if (insertError) {
      // Clean up orphaned storage file
      await supabase.storage.from(BUCKET).remove([storagePath])
      return NextResponse.json({ error: 'Failed to save screenshot record' }, { status: 500 })
    }

    return NextResponse.json({ screenshot: record }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
