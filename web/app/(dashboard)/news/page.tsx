import { createClient } from '@/lib/supabase/server'
import { NewsClient } from '@/components/news/NewsClient'
import type { NewsEvent } from '@/types/trade'

export default async function NewsPage() {
  // Trigger refresh (no-op if data is fresh)
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    await fetch(`${baseUrl}/api/news/refresh`, { cache: 'no-store' })
  } catch {
    // Non-blocking — continue even if refresh fails
  }

  const supabase = await createClient()
  const twoWeeksFromNow = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()

  const { data: events } = await supabase
    .from('news_events')
    .select('*')
    .gte('scheduled_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // include yesterday
    .lte('scheduled_at', twoWeeksFromNow)
    .order('scheduled_at', { ascending: true })

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Economic Calendar</h1>
        <p className="text-zinc-500 text-sm mt-1">High-impact events for the next 2 weeks.</p>
      </div>
      <NewsClient events={(events ?? []) as NewsEvent[]} />
    </div>
  )
}
