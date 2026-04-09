'use client'

import { useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import type { TradeRecord } from '@/types/trade'
import TradeDrawer from './TradeDrawer'
import DailyNote from './DailyNote'

// ------------------------------------------------------------------
// Utilities
// ------------------------------------------------------------------

function formatDuration(openedAt: string | null, closedAt: string | null): string | null {
  if (!openedAt || !closedAt) return null
  const ms = new Date(closedAt).getTime() - new Date(openedAt).getTime()
  if (ms <= 0) return null
  const totalMins = Math.floor(ms / 60000)
  if (totalMins < 60) return `${totalMins}m`
  const h = Math.floor(totalMins / 60)
  const m = totalMins % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function formatTime(iso: string | null, timezone: string): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleTimeString('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function getTradeDay(trade: TradeRecord, timezone: string): string {
  const raw = trade.opened_at ?? trade.created_at
  return new Date(raw).toLocaleDateString('en-CA', { timeZone: timezone }) // YYYY-MM-DD
}

function dayLabel(date: string, timezone: string): string {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: timezone })
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: timezone })
  if (date === today) return 'Today'
  if (date === yesterday) return 'Yesterday'
  return new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })
}

function daySubLabel(date: string, timezone: string): string | null {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: timezone })
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: timezone })
  if (date === today || date === yesterday) {
    return new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    })
  }
  return null
}

interface DayGroup {
  date: string
  trades: TradeRecord[]
  pnl: number
  wins: number
  winRate: number
}

function groupTradesByDay(trades: TradeRecord[], timezone: string): DayGroup[] {
  const map = new Map<string, TradeRecord[]>()
  for (const t of trades) {
    const day = getTradeDay(t, timezone)
    if (!map.has(day)) map.set(day, [])
    map.get(day)!.push(t)
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, dayTrades]) => {
      const pnl = dayTrades.reduce((s, t) => s + (t.pnl ?? 0), 0)
      const wins = dayTrades.filter(t => (t.pnl ?? 0) > 0).length
      const winRate = dayTrades.length > 0 ? Math.round((wins / dayTrades.length) * 100) : 0
      return { date, trades: dayTrades, pnl, wins, winRate }
    })
}

// ------------------------------------------------------------------
// Trade Card
// ------------------------------------------------------------------

function TradeCard({
  trade,
  onClick,
  tradingTimezone,
}: {
  trade: TradeRecord
  onClick: () => void
  tradingTimezone: string
}) {
  const pnlPositive = (trade.pnl ?? 0) >= 0
  const pnlColor = pnlPositive ? 'text-emerald-400' : 'text-red-400'
  const directionBg =
    trade.direction === 'long'
      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
      : 'bg-red-500/15 text-red-400 border-red-500/25'

  const time = formatTime(trade.opened_at, tradingTimezone)
  const duration = formatDuration(trade.opened_at, trade.closed_at)

  return (
    <div
      onClick={onClick}
      className="relative bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 cursor-pointer hover:border-zinc-700 hover:bg-zinc-900 transition-all group"
    >
      {/* Incomplete badge */}
      {trade.incomplete && (
        <div className="absolute top-3 right-3">
          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25">
            Incomplete
          </span>
        </div>
      )}

      {/* Instrument + direction */}
      <div className="flex items-center gap-2 mb-2.5 pr-20">
        <span className="text-white font-bold text-base leading-none">{trade.instrument}</span>
        {trade.direction && (
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${directionBg}`}>
            {trade.direction.toUpperCase()}
          </span>
        )}
      </div>

      {/* PnL */}
      <div className={`text-2xl font-bold mb-3 ${pnlColor}`}>
        {trade.pnl !== null
          ? `${pnlPositive ? '+' : ''}$${trade.pnl.toFixed(2)}`
          : <span className="text-zinc-600 text-sm font-normal">No P&amp;L</span>
        }
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-2 flex-wrap">
        {trade.emotion_tag && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700/60">
            {trade.emotion_tag}
          </span>
        )}
        {trade.rr && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
            {trade.rr}
          </span>
        )}
        {trade.execution_score !== null && (
          <span className="text-xs text-zinc-600">
            {trade.execution_score}/10
          </span>
        )}
        <div className="ml-auto flex items-center gap-2 text-xs text-zinc-600">
          {duration && <span>{duration}</span>}
          {time && <span>{time}</span>}
        </div>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------
// Day Group Header
// ------------------------------------------------------------------

function DayHeader({ group, timezone }: { group: DayGroup; timezone: string }) {
  const label = dayLabel(group.date, timezone)
  const sub = daySubLabel(group.date, timezone)
  const pnlPositive = group.pnl >= 0
  const pnlStr = `${pnlPositive ? '+' : ''}$${Math.abs(group.pnl).toFixed(2)}`

  return (
    <div className="mb-4">
      <div className="flex items-end justify-between mb-3">
        {/* Date */}
        <div>
          <span className="text-white font-semibold text-sm">{label}</span>
          {sub && <span className="text-zinc-600 text-xs ml-2">{sub}</span>}
        </div>

        {/* Day stats */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-600">
            {group.trades.length} trade{group.trades.length !== 1 ? 's' : ''}
          </span>
          <span className="text-xs text-zinc-500">
            {group.winRate}% WR
          </span>
          <span className={`text-sm font-bold tabular-nums ${pnlPositive ? 'text-emerald-400' : 'text-red-400'}`}>
            {pnlStr}
          </span>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-zinc-800 mb-4" />
    </div>
  )
}

// ------------------------------------------------------------------
// Skeleton
// ------------------------------------------------------------------

function SkeletonCard() {
  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 animate-pulse">
      <div className="flex items-center gap-2 mb-2.5">
        <div className="h-4 w-12 bg-zinc-800 rounded" />
        <div className="h-3.5 w-10 bg-zinc-800 rounded-full" />
      </div>
      <div className="h-7 w-20 bg-zinc-800 rounded mb-3" />
      <div className="flex gap-2">
        <div className="h-3.5 w-14 bg-zinc-800 rounded-full" />
        <div className="h-3.5 w-10 bg-zinc-800 rounded ml-auto" />
      </div>
    </div>
  )
}

// ------------------------------------------------------------------
// Main component
// ------------------------------------------------------------------

interface JournalClientProps {
  initialTrades: TradeRecord[]
  initialTotal: number
  tradingTimezone: string
}

export default function JournalClient({ initialTrades, initialTotal, tradingTimezone }: JournalClientProps) {
  const router = useRouter()

  const [trades, setTrades] = useState<TradeRecord[]>(initialTrades)
  const [total, setTotal] = useState(initialTotal)
  const [offset, setOffset] = useState(initialTrades.length)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [instrument, setInstrument] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [direction, setDirection] = useState<'all' | 'long' | 'short'>('all')

  // Drawer
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingTrade, setEditingTrade] = useState<TradeRecord | undefined>(undefined)

  // Group trades by day
  const dayGroups = useMemo(
    () => groupTradesByDay(trades, tradingTimezone),
    [trades, tradingTimezone]
  )

  const buildParams = useCallback((overrides?: {
    instrument?: string; from?: string; to?: string
    direction?: 'all' | 'long' | 'short'; offset?: number; limit?: number
  }) => {
    const params = new URLSearchParams()
    const inst = overrides?.instrument ?? instrument
    const f = overrides?.from ?? from
    const t = overrides?.to ?? to
    const dir = overrides?.direction ?? direction
    const off = overrides?.offset ?? 0
    const lim = overrides?.limit ?? 50

    if (inst) params.set('instrument', inst)
    if (f) params.set('from', f)
    if (t) params.set('to', t)
    if (dir !== 'all') params.set('direction', dir)
    params.set('offset', String(off))
    params.set('limit', String(lim))
    return params
  }, [instrument, from, to, direction])

  const fetchTrades = useCallback(async (overrides?: {
    instrument?: string; from?: string; to?: string; direction?: 'all' | 'long' | 'short'
  }) => {
    setLoading(true)
    setError(null)
    try {
      const params = buildParams({ ...overrides, offset: 0, limit: 50 })
      const res = await fetch(`/api/trades?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to load trades')
      const data = await res.json() as { trades: TradeRecord[]; total: number }
      setTrades(data.trades)
      setTotal(data.total)
      setOffset(data.trades.length)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load trades')
    } finally {
      setLoading(false)
    }
  }, [buildParams])

  const loadMore = async () => {
    if (loadingMore || trades.length >= total) return
    setLoadingMore(true)
    try {
      const params = buildParams({ offset, limit: 50 })
      const res = await fetch(`/api/trades?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to load more')
      const data = await res.json() as { trades: TradeRecord[]; total: number }
      setTrades(prev => [...prev, ...data.trades])
      setTotal(data.total)
      setOffset(prev => prev + data.trades.length)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more')
    } finally {
      setLoadingMore(false)
    }
  }

  const handleFilter = () => fetchTrades()

  const handleReset = () => {
    setInstrument('')
    setFrom('')
    setTo('')
    setDirection('all')
    fetchTrades({ instrument: '', from: '', to: '', direction: 'all' })
  }

  const handleCardClick = (trade: TradeRecord) => {
    router.push(`/journal/${trade.id}`)
  }

  const handleAddTrade = () => {
    setEditingTrade(undefined)
    setDrawerOpen(true)
  }

  const handleSave = () => {
    setDrawerOpen(false)
    setEditingTrade(undefined)
    fetchTrades()
  }

  const hasMore = trades.length < total

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Journal</h1>
            {!loading && total > 0 && (
              <p className="text-zinc-600 text-xs mt-0.5">{total} trade{total !== 1 ? 's' : ''} total</p>
            )}
          </div>
          <button
            onClick={handleAddTrade}
            className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
          >
            <span className="text-zinc-400">+</span> Add Trade
          </button>
        </div>

        {/* Filter bar */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 mb-8 flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[130px]">
            <label className="block text-xs text-zinc-500 mb-1">Instrument</label>
            <input
              type="text"
              value={instrument}
              onChange={(e) => setInstrument(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleFilter()}
              placeholder="NQ, ES, AAPL…"
              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-zinc-500 transition"
            />
          </div>
          <div className="min-w-[130px]">
            <label className="block text-xs text-zinc-500 mb-1">From</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-zinc-500 transition"
            />
          </div>
          <div className="min-w-[130px]">
            <label className="block text-xs text-zinc-500 mb-1">To</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-zinc-500 transition"
            />
          </div>
          <div className="min-w-[110px]">
            <label className="block text-xs text-zinc-500 mb-1">Direction</label>
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value as 'all' | 'long' | 'short')}
              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-zinc-500 transition"
            >
              <option value="all">All</option>
              <option value="long">Long</option>
              <option value="short">Short</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleFilter}
              className="bg-zinc-700 hover:bg-zinc-600 text-white text-sm px-4 py-2 rounded-lg transition-colors"
            >
              Filter
            </button>
            <button
              onClick={handleReset}
              className="bg-transparent hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 text-sm px-3 py-2 rounded-lg transition-colors"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-6 flex items-center justify-between">
            <span className="text-red-400 text-sm">{error}</span>
            <button onClick={() => fetchTrades()} className="text-sm text-red-400 hover:text-red-300 underline">
              Retry
            </button>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-8">
            {[0, 1].map(i => (
              <div key={i}>
                <div className="flex items-center justify-between mb-3">
                  <div className="h-4 w-20 bg-zinc-800 rounded animate-pulse" />
                  <div className="h-4 w-28 bg-zinc-800 rounded animate-pulse" />
                </div>
                <div className="h-px bg-zinc-800 mb-4" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[0, 1, 2].map(j => <SkeletonCard key={j} />)}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && trades.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-5">
              <svg className="w-7 h-7 text-zinc-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
              </svg>
            </div>
            <p className="text-zinc-300 font-medium mb-1">No trades yet</p>
            <p className="text-zinc-600 text-sm">Start recording — your journal builds itself</p>
          </div>
        )}

        {/* Day groups */}
        {!loading && dayGroups.length > 0 && (
          <div className="space-y-10">
            {dayGroups.map(group => (
              <div key={group.date}>
                <DayHeader group={group} timezone={tradingTimezone} />

                {/* AI note for this day — renders nothing if no note */}
                <div className="mb-5">
                  <DailyNote date={group.date} timezone={tradingTimezone} />
                </div>

                {/* Trade grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {group.trades.map(trade => (
                    <TradeCard
                      key={trade.id}
                      trade={trade}
                      onClick={() => handleCardClick(trade)}
                      tradingTimezone={tradingTimezone}
                    />
                  ))}
                </div>
              </div>
            ))}

            {/* Load more */}
            {hasMore && (
              <div className="flex justify-center pt-2 pb-8">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="text-zinc-500 hover:text-zinc-300 text-sm border border-zinc-800 hover:border-zinc-700 px-6 py-2.5 rounded-lg transition-all disabled:opacity-50"
                >
                  {loadingMore ? 'Loading…' : `Load more · ${total - trades.length} remaining`}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add/Edit drawer */}
      <TradeDrawer
        isOpen={drawerOpen}
        onClose={() => { setDrawerOpen(false); setEditingTrade(undefined) }}
        onSave={handleSave}
        trade={editingTrade}
      />
    </div>
  )
}
