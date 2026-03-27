'use client'

import { useMemo, useState } from 'react'
import type { NewsEvent } from '@/types/trade'

// ─── Constants ──────────────────────────────────────────────────────────────

const CURRENCIES = ['All', 'USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'NZD', 'CHF']

const IMPACT_CONFIG = {
  high:   { color: 'bg-red-500',    label: 'High',   text: 'text-red-400' },
  medium: { color: 'bg-yellow-500', label: 'Med',    text: 'text-yellow-400' },
  low:    { color: 'bg-zinc-500',   label: 'Low',    text: 'text-zinc-500' },
}

const CURRENCY_FLAGS: Record<string, string> = {
  USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵',
  CAD: '🇨🇦', AUD: '🇦🇺', NZD: '🇳🇿', CHF: '🇨🇭',
  CNY: '🇨🇳',
}

// ─── Utilities ──────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
}

function formatDayHeader(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)

  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow'
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

function getDateKey(iso: string): string {
  return iso.split('T')[0]
}

function isPast(iso: string): boolean {
  return new Date(iso) < new Date()
}

function formatValue(val: string | null, unit: string | null): string {
  if (val == null) return '—'
  return unit ? `${val}${unit}` : val
}

// ─── Component ──────────────────────────────────────────────────────────────

export function NewsClient({ events }: { events: NewsEvent[] }) {
  const [currency, setCurrency] = useState('All')
  const [impactFilter, setImpactFilter] = useState<'all' | 'high' | 'medium'>('all')

  const filtered = useMemo(() => {
    return events.filter(e => {
      if (currency !== 'All' && e.currency !== currency) return false
      if (impactFilter === 'high' && e.impact !== 'high') return false
      if (impactFilter === 'medium' && e.impact !== 'high' && e.impact !== 'medium') return false
      return true
    })
  }, [events, currency, impactFilter])

  // Group by date
  const grouped = useMemo(() => {
    const map = new Map<string, NewsEvent[]>()
    filtered.forEach(e => {
      const key = getDateKey(e.scheduled_at)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(e)
    })
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [filtered])

  const availableCurrencies = useMemo(() => {
    const seen = new Set(events.map(e => e.currency).filter(Boolean))
    return CURRENCIES.filter(c => c === 'All' || seen.has(c))
  }, [events])

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-zinc-500 text-sm">No calendar data yet.</p>
        <p className="text-zinc-600 text-xs">Add FINNHUB_API_KEY to your environment and reload.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Currency filter */}
        <div className="flex gap-1 flex-wrap">
          {availableCurrencies.map(c => (
            <button
              key={c}
              onClick={() => setCurrency(c)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                currency === c
                  ? 'bg-violet-600 text-white'
                  : 'bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              {c !== 'All' && CURRENCY_FLAGS[c] ? `${CURRENCY_FLAGS[c]} ` : ''}{c}
            </button>
          ))}
        </div>

        {/* Impact filter */}
        <div className="flex gap-1 ml-auto">
          {(['all', 'medium', 'high'] as const).map(imp => (
            <button
              key={imp}
              onClick={() => setImpactFilter(imp)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition capitalize ${
                impactFilter === imp
                  ? 'bg-zinc-700 text-white'
                  : 'bg-zinc-900 text-zinc-500 hover:text-white'
              }`}
            >
              {imp === 'all' ? 'All Impact' : imp === 'medium' ? 'Med+' : 'High Only'}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar */}
      {grouped.length === 0 ? (
        <div className="flex items-center justify-center h-40 text-zinc-500 text-sm">
          No events match the current filter.
        </div>
      ) : (
        grouped.map(([dateKey, dayEvents]) => (
          <div key={dateKey}>
            {/* Day header */}
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-sm font-semibold text-zinc-300">
                {formatDayHeader(dayEvents[0].scheduled_at)}
              </h2>
              <div className="flex-1 h-px bg-zinc-800" />
              <span className="text-xs text-zinc-600">{dateKey}</span>
            </div>

            {/* Events table */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-[80px_60px_60px_1fr_90px_90px_90px] gap-0 border-b border-zinc-800 px-4 py-2">
                {['Time', 'Curr', 'Impact', 'Event', 'Previous', 'Forecast', 'Actual'].map(h => (
                  <span key={h} className="text-xs text-zinc-600 font-medium">{h}</span>
                ))}
              </div>

              {/* Rows */}
              {dayEvents.map((event, i) => {
                const impact = IMPACT_CONFIG[event.impact as keyof typeof IMPACT_CONFIG] ?? IMPACT_CONFIG.low
                const past = isPast(event.scheduled_at)
                const hasActual = event.actual != null

                return (
                  <div
                    key={event.id}
                    className={`grid grid-cols-[80px_60px_60px_1fr_90px_90px_90px] gap-0 px-4 py-3 items-center transition ${
                      i < dayEvents.length - 1 ? 'border-b border-zinc-800/60' : ''
                    } ${past ? 'opacity-60' : 'hover:bg-zinc-800/40'}`}
                  >
                    {/* Time */}
                    <span className={`text-xs font-mono ${past ? 'text-zinc-600' : 'text-zinc-400'}`}>
                      {formatTime(event.scheduled_at)}
                    </span>

                    {/* Currency */}
                    <div className="flex items-center gap-1">
                      {event.currency && CURRENCY_FLAGS[event.currency] && (
                        <span className="text-sm">{CURRENCY_FLAGS[event.currency]}</span>
                      )}
                      <span className={`text-xs font-semibold ${impact.text}`}>
                        {event.currency ?? '—'}
                      </span>
                    </div>

                    {/* Impact */}
                    <div className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${impact.color}`} />
                      <span className="text-xs text-zinc-500">{impact.label}</span>
                    </div>

                    {/* Event name */}
                    <span className={`text-sm pr-4 ${past ? 'text-zinc-500' : 'text-zinc-200'} ${event.impact === 'high' ? 'font-medium' : ''}`}>
                      {event.event_name}
                    </span>

                    {/* Previous */}
                    <span className="text-xs text-zinc-500 font-mono">
                      {formatValue(event.previous, event.unit)}
                    </span>

                    {/* Forecast */}
                    <span className="text-xs text-zinc-400 font-mono">
                      {formatValue(event.forecast, event.unit)}
                    </span>

                    {/* Actual — green if beat forecast, red if missed */}
                    <span className={`text-xs font-mono font-semibold ${(() => {
                      if (!hasActual) return 'text-zinc-600'
                      const a = parseFloat(event.actual!)
                      const f = event.forecast != null ? parseFloat(event.forecast) : NaN
                      if (isNaN(f)) return 'text-zinc-300'
                      return a > f ? 'text-green-400' : a < f ? 'text-red-400' : 'text-zinc-300'
                    })()}`}>
                      {hasActual ? formatValue(event.actual, event.unit) : past ? 'Pending' : '—'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        ))
      )}

      <p className="text-xs text-zinc-700 pb-6">
        Times shown in your local timezone. Data via Finnhub. Refreshes automatically every 12 hours.
      </p>
    </div>
  )
}
