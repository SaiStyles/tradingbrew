'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { TradeRecord } from '@/types/trade'
import TradeDrawer from './TradeDrawer'
import DailyNote from './DailyNote'

// ------------------------------------------------------------------
// Trade Card
// ------------------------------------------------------------------

function TradeCard({ trade, onClick, tradingTimezone }: { trade: TradeRecord; onClick: () => void; tradingTimezone: string }) {
  const pnlPositive = (trade.pnl ?? 0) >= 0
  const pnlColor = pnlPositive ? 'text-emerald-400' : 'text-red-400'
  const directionColor = trade.direction === 'long' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30'

  const formattedDate = trade.opened_at
    ? new Date(trade.opened_at).toLocaleDateString('en-US', {
        timeZone: tradingTimezone,
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : new Date(trade.created_at).toLocaleDateString('en-US', {
        timeZone: tradingTimezone,
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })

  return (
    <div
      onClick={onClick}
      className="relative bg-zinc-900 border border-zinc-800 rounded-xl p-4 cursor-pointer hover:border-zinc-700 transition-all group"
    >
      {/* Top-right badges */}
      <div className="absolute top-3 right-3 flex items-center gap-2">
        {trade.incomplete && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1">
            <span>&#9888;</span> Incomplete
          </span>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onClick()
          }}
          className="text-zinc-600 hover:text-zinc-300 transition-colors opacity-0 group-hover:opacity-100"
          aria-label="Edit trade"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </button>
      </div>

      {/* Instrument + Direction */}
      <div className="flex items-center gap-3 mb-3 pr-24">
        <h3 className="text-white font-bold text-lg leading-none">{trade.instrument}</h3>
        {trade.direction && (
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${directionColor}`}>
            {trade.direction.toUpperCase()}
          </span>
        )}
      </div>

      {/* PnL */}
      <div className={`text-2xl font-bold mb-3 ${pnlColor}`}>
        {trade.pnl !== null
          ? `${pnlPositive ? '+' : ''}$${trade.pnl.toFixed(2)}`
          : <span className="text-zinc-600 text-base font-normal">P&L not set</span>
        }
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-2 flex-wrap">
        {trade.emotion_tag && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">
            {trade.emotion_tag}
          </span>
        )}
        {trade.rr && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
            {trade.rr}
          </span>
        )}
        {trade.market_condition && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-500 border border-zinc-700">
            {trade.market_condition}
          </span>
        )}
        {trade.execution_score !== null && (
          <span className="text-xs text-zinc-500">
            {trade.execution_score}/10
          </span>
        )}
        <span className="text-xs text-zinc-600 ml-auto">{formattedDate}</span>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------
// Skeleton Card
// ------------------------------------------------------------------

function SkeletonCard() {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 animate-pulse">
      <div className="flex items-center gap-3 mb-3">
        <div className="h-5 w-16 bg-zinc-800 rounded" />
        <div className="h-4 w-12 bg-zinc-800 rounded-full" />
      </div>
      <div className="h-8 w-24 bg-zinc-800 rounded mb-3" />
      <div className="flex gap-2">
        <div className="h-4 w-16 bg-zinc-800 rounded-full" />
        <div className="h-4 w-20 bg-zinc-800 rounded ml-auto" />
      </div>
    </div>
  )
}

// ------------------------------------------------------------------
// Main client component
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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [instrument, setInstrument] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [direction, setDirection] = useState<'all' | 'long' | 'short'>('all')

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingTrade, setEditingTrade] = useState<TradeRecord | undefined>(undefined)

  const fetchTrades = useCallback(async (overrides?: {
    instrument?: string
    from?: string
    to?: string
    direction?: 'all' | 'long' | 'short'
  }) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      const inst = overrides?.instrument ?? instrument
      const f = overrides?.from ?? from
      const t = overrides?.to ?? to
      const dir = overrides?.direction ?? direction

      if (inst) params.set('instrument', inst)
      if (f) params.set('from', f)
      if (t) params.set('to', t)
      if (dir !== 'all') params.set('direction', dir)
      params.set('include_incomplete', 'true')

      const res = await fetch(`/api/trades?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to load trades')
      const data = await res.json() as { trades: TradeRecord[]; total: number }
      setTrades(data.trades)
      setTotal(data.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load trades')
    } finally {
      setLoading(false)
    }
  }, [instrument, from, to, direction])

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

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-white">Journal</h1>
          <button
            onClick={handleAddTrade}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            + Add Trade
          </button>
        </div>

        {/* Filter bar */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6 flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs text-zinc-500 mb-1">Instrument</label>
            <input
              type="text"
              value={instrument}
              onChange={(e) => setInstrument(e.target.value)}
              placeholder="NQ, ES, AAPL..."
              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 transition"
            />
          </div>
          <div className="min-w-[140px]">
            <label className="block text-xs text-zinc-500 mb-1">From</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 transition"
            />
          </div>
          <div className="min-w-[140px]">
            <label className="block text-xs text-zinc-500 mb-1">To</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 transition"
            />
          </div>
          <div className="min-w-[120px]">
            <label className="block text-xs text-zinc-500 mb-1">Direction</label>
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value as 'all' | 'long' | 'short')}
              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 transition"
            >
              <option value="all">All</option>
              <option value="long">Long</option>
              <option value="short">Short</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleFilter}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg transition-colors"
            >
              Filter
            </button>
            <button
              onClick={handleReset}
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm px-4 py-2 rounded-lg transition-colors"
            >
              Reset
            </button>
          </div>
        </div>

        {/* AI Note for today */}
        <div className="mb-6">
          <DailyNote date={new Date().toLocaleDateString('en-CA', { timeZone: tradingTimezone })} />
        </div>

        {/* Error state */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-6 flex items-center justify-between">
            <span className="text-red-400 text-sm">{error}</span>
            <button
              onClick={() => fetchTrades()}
              className="text-sm text-red-400 hover:text-red-300 underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* Count */}
        {!loading && !error && (
          <p className="text-zinc-500 text-sm mb-4">{total} trade{total !== 1 ? 's' : ''}</p>
        )}

        {/* Trade grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : trades.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="text-4xl mb-4">&#128203;</div>
            <p className="text-zinc-400 text-lg mb-2">No trades yet</p>
            <p className="text-zinc-600 text-sm">Tell your buddy about your first trade</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {trades.map((trade) => (
              <TradeCard
                key={trade.id}
                trade={trade}
                onClick={() => handleCardClick(trade)}
                tradingTimezone={tradingTimezone}
              />
            ))}
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
