import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

const BUCKET = 'trade-screenshots'

// ------------------------------------------------------------------
// DELETE /api/screenshots/[id]
// ------------------------------------------------------------------
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params

    // Fetch the record first — need storage_path + ownership check
    const { data: record, error: fetchError } = await supabase
      .from('screenshots')
      .select('storage_path')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !record) {
      return NextResponse.json({ error: 'Screenshot not found' }, { status: 404 })
    }

    // Remove from storage
    await supabase.storage.from(BUCKET).remove([record.storage_path])

    // Delete record
    const { error: deleteError } = await supabase
      .from('screenshots')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (deleteError) return NextResponse.json({ error: 'Delete failed' }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
