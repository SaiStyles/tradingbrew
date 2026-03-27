import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Map Finnhub country code → currency label
const COUNTRY_TO_CURRENCY: Record<string, string> = {
  US: 'USD', EU: 'EUR', GB: 'GBP', JP: 'JPY',
  CA: 'CAD', AU: 'AUD', NZ: 'NZD', CH: 'CHF',
  CN: 'CNY', DE: 'EUR', FR: 'EUR', IT: 'EUR',
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

export async function GET() {
  try {
    const apiKey = process.env.FINNHUB_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'FINNHUB_API_KEY not set' }, { status: 500 })
    }

    const supabase = await createClient()

    // Staleness check — if we have any event scheduled in the next 7 days
    // that was inserted in the last 12 hours, skip the fetch
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    const { data: existing } = await supabase
      .from('news_events')
      .select('id')
      .gte('scheduled_at', new Date().toISOString())
      .lte('scheduled_at', nextWeek)
      .gte('created_at', twelveHoursAgo)
      .limit(1)

    if (existing && existing.length > 0) {
      return NextResponse.json({ refreshed: false, reason: 'data is fresh' })
    }

    // Fetch 14 days from today
    const from = toDateStr(new Date())
    const to = toDateStr(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000))

    const res = await fetch(
      `https://finnhub.io/api/v1/calendar/economic?from=${from}&to=${to}&token=${apiKey}`,
      { next: { revalidate: 0 } }
    )

    if (!res.ok) {
      return NextResponse.json({ error: `Finnhub error: ${res.status}` }, { status: 502 })
    }

    const json = await res.json()
    const events: {
      event: string
      time: string
      impact: string
      country: string
      prev: number | null
      estimate: number | null
      actual: number | null
      unit: string | null
    }[] = json.economicCalendar ?? []

    if (events.length === 0) {
      return NextResponse.json({ refreshed: false, reason: 'no events from Finnhub' })
    }

    // Delete future events (keep past — they have actual values)
    await supabase
      .from('news_events')
      .delete()
      .gte('scheduled_at', new Date().toISOString())

    // Build rows to insert
    const rows = events
      .filter(e => e.event && e.time)
      .map(e => ({
        event_name: e.event,
        scheduled_at: new Date(e.time).toISOString(),
        impact: (e.impact ?? 'low').toLowerCase(),
        currency: COUNTRY_TO_CURRENCY[e.country] ?? e.country ?? null,
        country: e.country ?? null,
        previous: e.prev != null ? String(e.prev) : null,
        forecast: e.estimate != null ? String(e.estimate) : null,
        actual: e.actual != null ? String(e.actual) : null,
        unit: e.unit ?? null,
      }))

    const { error } = await supabase.from('news_events').insert(rows)

    if (error) {
      console.error('[news/refresh] insert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ refreshed: true, count: rows.length })
  } catch (e) {
    console.error('[news/refresh] error:', e)
    return NextResponse.json({ error: 'unexpected error' }, { status: 500 })
  }
}
