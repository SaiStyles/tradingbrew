'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Rule } from '@/types/trade'

const STARTERS = [
  'No trading after 2 losses in a row',
  'Stop if daily loss exceeds my limit',
  'Only trade the first 2 hours of the session',
  'Walk away if I feel frustrated',
  'Never average down on a losing trade',
]

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ─── Toggle ────────────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
        checked ? 'bg-blue-600' : 'bg-zinc-700'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

// ─── Toast ─────────────────────────────────────────────────────────────────

type ToastState = { type: 'success' | 'error'; message: string } | null

function Toast({ toast }: { toast: ToastState }) {
  if (!toast) return null
  return (
    <div
      className={`fixed top-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium shadow-lg ${
        toast.type === 'success'
          ? 'bg-green-500/20 border border-green-500/40 text-green-400'
          : 'bg-red-500/20 border border-red-500/40 text-red-400'
      }`}
    >
      {toast.type === 'success' ? '✓' : '✕'} {toast.message}
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function RulesPage() {
  const [rules, setRules] = useState<Rule[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastState>(null)

  function showToast(type: 'success' | 'error', message: string) {
    setToast({ type, message })
    setTimeout(() => setToast(null), 3000)
  }

  // Fetch rules
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/rules')
        if (!res.ok) throw new Error()
        const { rules: data } = await res.json() as { rules: Rule[] }
        setRules(data)
      } catch {
        showToast('error', 'Failed to load rules')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Add rule
  async function handleAdd() {
    const trimmed = text.trim()
    if (!trimmed) return
    setSaving(true)
    try {
      const res = await fetch('/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_text: trimmed }),
      })
      if (!res.ok) throw new Error()
      const { rule } = await res.json() as { rule: Rule }
      setRules(prev => [rule, ...prev])
      setText('')
      showToast('success', 'Rule added')
    } catch {
      showToast('error', 'Failed to add rule')
    } finally {
      setSaving(false)
    }
  }

  // Toggle is_active — optimistic update
  const handleToggle = useCallback(async (rule: Rule) => {
    setTogglingId(rule.id)
    const newVal = !rule.is_active
    // Optimistic
    setRules(prev => prev.map(r => r.id === rule.id ? { ...r, is_active: newVal } : r))
    try {
      const res = await fetch(`/api/rules/${rule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: newVal }),
      })
      if (!res.ok) throw new Error()
    } catch {
      // Revert on error
      setRules(prev => prev.map(r => r.id === rule.id ? { ...r, is_active: !newVal } : r))
      showToast('error', 'Failed to update rule')
    } finally {
      setTogglingId(null)
    }
  }, [])

  // Delete — soft delete
  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/rules/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setRules(prev => prev.filter(r => r.id !== id))
      setConfirmDeleteId(null)
      showToast('success', 'Rule deleted')
    } catch {
      showToast('error', 'Failed to delete rule')
    } finally {
      setDeletingId(null)
    }
  }

  const activeRules = rules.filter(r => r.is_active)
  const inactiveRules = rules.filter(r => !r.is_active)

  return (
    <div className="p-6 max-w-2xl">
      <Toast toast={toast} />

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Your rules</h1>
        <p className="text-zinc-500 text-sm mt-1.5 leading-relaxed">
          Write any commitment to yourself. Brew reads and understands them — no forms, no dropdowns.
        </p>
      </div>

      {/* Add rule */}
      <div className="mb-8">
        <textarea
          rows={4}
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="e.g. I stop trading after two consecutive losses"
          maxLength={500}
          className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors resize-none"
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              handleAdd()
            }
          }}
        />

        {/* Starter chips */}
        <div className="flex flex-wrap gap-2 mt-2 mb-3">
          {STARTERS.map(s => (
            <button
              key={s}
              onClick={() => setText(s)}
              className="text-xs px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-400 hover:text-white rounded-full transition-colors"
            >
              {s}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-zinc-600">{text.length}/500</p>
          <button
            onClick={handleAdd}
            disabled={saving || !text.trim()}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {saving ? 'Adding...' : 'Add rule'}
          </button>
        </div>
      </div>

      {/* Rules list */}
      {loading ? (
        <div className="text-zinc-600 text-sm">Loading...</div>
      ) : rules.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-zinc-600 text-sm">No rules yet. Add your first commitment above.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Active rules */}
          {activeRules.length > 0 && (
            <section>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
                Active — {activeRules.length}
              </p>
              <div className="space-y-2">
                {activeRules.map(rule => (
                  <RuleCard
                    key={rule.id}
                    rule={rule}
                    onToggle={handleToggle}
                    toggling={togglingId === rule.id}
                    onDeleteClick={() => setConfirmDeleteId(rule.id)}
                    confirmDelete={confirmDeleteId === rule.id}
                    onDeleteConfirm={() => handleDelete(rule.id)}
                    onDeleteCancel={() => setConfirmDeleteId(null)}
                    deleting={deletingId === rule.id}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Inactive rules */}
          {inactiveRules.length > 0 && (
            <section>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
                Paused — {inactiveRules.length}
              </p>
              <div className="space-y-2">
                {inactiveRules.map(rule => (
                  <RuleCard
                    key={rule.id}
                    rule={rule}
                    onToggle={handleToggle}
                    toggling={togglingId === rule.id}
                    onDeleteClick={() => setConfirmDeleteId(rule.id)}
                    confirmDelete={confirmDeleteId === rule.id}
                    onDeleteConfirm={() => handleDelete(rule.id)}
                    onDeleteCancel={() => setConfirmDeleteId(null)}
                    deleting={deletingId === rule.id}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Rule Card ─────────────────────────────────────────────────────────────

function RuleCard({
  rule,
  onToggle,
  toggling,
  onDeleteClick,
  confirmDelete,
  onDeleteConfirm,
  onDeleteCancel,
  deleting,
}: {
  rule: Rule
  onToggle: (rule: Rule) => void
  toggling: boolean
  onDeleteClick: () => void
  confirmDelete: boolean
  onDeleteConfirm: () => void
  onDeleteCancel: () => void
  deleting: boolean
}) {
  return (
    <div
      className={`bg-zinc-900 border rounded-xl p-4 transition-colors ${
        rule.is_active ? 'border-zinc-800' : 'border-zinc-800/50 opacity-60'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Text */}
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm leading-relaxed">{rule.raw_text}</p>

          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <span className="text-zinc-600 text-xs">Added {formatDate(rule.created_at)}</span>

            {rule.last_triggered_at && (
              <span className="flex items-center gap-1 text-xs text-amber-500/80">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
                Last flagged: {formatDate(rule.last_triggered_at)}
              </span>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <Toggle
            checked={rule.is_active}
            onChange={() => !toggling && onToggle(rule)}
          />

          {confirmDelete ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={onDeleteConfirm}
                disabled={deleting}
                className="text-xs text-red-400 hover:text-red-300 font-medium disabled:opacity-40 transition-colors"
              >
                {deleting ? '...' : 'Delete'}
              </button>
              <button
                onClick={onDeleteCancel}
                className="text-xs text-zinc-500 hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={onDeleteClick}
              className="text-zinc-700 hover:text-red-400 transition-colors p-1"
              title="Delete rule"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
