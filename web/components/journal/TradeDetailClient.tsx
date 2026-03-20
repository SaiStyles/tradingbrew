'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { TradeRecord } from '@/types/trade'
import TradeDrawer from './TradeDrawer'

interface TradeDetailClientProps {
  trade: TradeRecord
}

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 py-3 border-b border-zinc-800 last:border-0">
      <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">{label}</span>
      <span className="text-white text-sm">{value ?? <span className="text-zinc-600">—</span>}</span>
    </div>
  )
}

export default function TradeDetailClient({ trade }: TradeDetailClientProps) {
  const router = useRouter()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [currentTrade, setCurrentTrade] = useState<TradeRecord>(trade)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const pnlPositive = (currentTrade.pnl ?? 0) >= 0
  const pnlColor = pnlPositive ? 'text-emerald-400' : 'text-red-400'

  const handleDelete = async () => {
    setDeleting(true)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/trades/${currentTrade.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json() as { error?: string }
        throw new Error(body.error ?? 'Delete failed')
      }
      router.push('/journal')
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete trade')
      setDeleting(false)
    }
  }

  const handleSave = async () => {
    // Refresh trade data after edit
    setDrawerOpen(false)
    try {
      const res = await fetch(`/api/trades/${currentTrade.id}`, { method: 'GET' })
      // GET by ID isn't implemented — just reload the page
    } catch {
      // Ignore
    }
    router.refresh()
  }

  const formatDate = (iso: string | null) => {
    if (!iso) return null
    return new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-2xl mx-auto px-4 py-8">

        {/* Navigation */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => router.push('/journal')}
            className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors text-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back to Journal
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDrawerOpen(true)}
              className="text-sm px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              Edit
            </button>
            <button
              onClick={() => setDeleteConfirm(true)}
              className="text-sm px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg transition-colors"
            >
              Delete
            </button>
          </div>
        </div>

        {/* Trade Header */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-3xl font-bold text-white">{currentTrade.instrument}</h1>
                {currentTrade.direction && (
                  <span className={`text-sm font-semibold px-3 py-1 rounded-full border ${
                    currentTrade.direction === 'long'
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                      : 'bg-red-500/20 text-red-400 border-red-500/30'
                  }`}>
                    {currentTrade.direction.toUpperCase()}
                  </span>
                )}
              </div>
              <p className="text-zinc-500 text-sm">{formatDate(currentTrade.opened_at) ?? formatDate(currentTrade.created_at)}</p>
            </div>
            <div className="text-right">
              <div className={`text-3xl font-bold ${pnlColor}`}>
                {currentTrade.pnl !== null
                  ? `${pnlPositive ? '+' : ''}$${currentTrade.pnl.toFixed(2)}`
                  : <span className="text-zinc-600 text-xl font-normal">No P&L</span>
                }
              </div>
              {currentTrade.incomplete && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 mt-1 inline-block">
                  &#9888; Incomplete
                </span>
              )}
            </div>
          </div>

          {/* Execution score */}
          {currentTrade.execution_score !== null && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500">Execution</span>
              <div className="flex items-center gap-1">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-2.5 h-2.5 rounded-full ${
                      i < (currentTrade.execution_score ?? 0)
                        ? 'bg-blue-500'
                        : 'bg-zinc-700'
                    }`}
                  />
                ))}
              </div>
              <span className="text-sm text-zinc-300">{currentTrade.execution_score}/10</span>
            </div>
          )}
        </div>

        {/* Details card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-6 py-2 mb-6">
          <FieldRow label="Entry Price" value={currentTrade.entry_price !== null ? `$${currentTrade.entry_price}` : null} />
          <FieldRow label="Exit Price" value={currentTrade.exit_price !== null ? `$${currentTrade.exit_price}` : null} />
          <FieldRow label="Stop Loss" value={currentTrade.stop_loss !== null ? `$${currentTrade.stop_loss}` : null} />
          <FieldRow label="Position Size" value={currentTrade.position_size ?? null} />
          <FieldRow label="Entry Time" value={formatDate(currentTrade.opened_at)} />
          <FieldRow label="Exit Time" value={formatDate(currentTrade.closed_at)} />
          <FieldRow
            label="Emotion"
            value={
              currentTrade.emotion_tag
                ? <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700 text-xs">{currentTrade.emotion_tag}</span>
                : null
            }
          />
          <FieldRow
            label="Followed Plan"
            value={
              currentTrade.followed_plan !== null
                ? currentTrade.followed_plan
                  ? <span className="text-emerald-400">Yes</span>
                  : <span className="text-red-400">No</span>
                : null
            }
          />
        </div>

        {/* Notes */}
        {currentTrade.notes && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
            <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-3">Notes</h2>
            <p className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">{currentTrade.notes}</p>
          </div>
        )}

        {/* Delete error */}
        {deleteError && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm">
            {deleteError}
          </div>
        )}
      </div>

      {/* Edit Drawer */}
      <TradeDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSave={handleSave}
        trade={currentTrade}
      />

      {/* Delete Confirm Dialog */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-sm w-full">
            <h2 className="text-white font-semibold mb-2">Delete Trade?</h2>
            <p className="text-zinc-400 text-sm mb-6">
              This will remove the trade from your journal. You can&apos;t undo this.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(false)}
                disabled={deleting}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white text-sm py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
