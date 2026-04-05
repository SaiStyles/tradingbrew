'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { TradeRecord, TradeDirection, EmotionTag } from '@/types/trade'

export interface TradeDrawerProps {
  isOpen: boolean
  onClose: () => void
  onSave: () => void
  trade?: TradeRecord
}

type SessionType = 'london' | 'new_york' | 'asia' | 'overlap'

type FormState = {
  instrument: string
  direction: TradeDirection | ''
  entry_price: string
  exit_price: string
  stop_loss: string
  pnl: string
  rr: string
  position_size: string
  opened_at: string
  closed_at: string
  emotion_tag: EmotionTag | ''
  execution_score: number
  notes: string
  followed_plan: boolean | null
  session: SessionType | ''
  setup_type: string
  exit_reason: string
  mistakes: string[]
}

const EMOTION_OPTIONS: EmotionTag[] = [
  'confident', 'hesitant', 'FOMO', 'revenge', 'bored', 'calm', 'frustrated', 'euphoric',
]

const SESSION_OPTIONS: { value: SessionType; label: string }[] = [
  { value: 'london',   label: 'London' },
  { value: 'new_york', label: 'New York' },
  { value: 'asia',     label: 'Asia' },
  { value: 'overlap',  label: 'Overlap' },
]

const EXIT_REASON_OPTIONS = [
  'Target hit',
  'Breakeven',
  'Stop out',
  'Manual exit',
  'Time stop',
  'Trailing stop',
  'News/event',
]

const MISTAKE_OPTIONS = [
  'Moved stop early',
  'Sized up on a loss',
  'Chased entry',
  'Ignored news',
  'Broke my rules',
  'Revenge traded',
  'FOMO entry',
  'Exited too early',
  'Held too long',
  'Wrong session',
]

function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return ''
  return iso.slice(0, 16)
}

function fromDatetimeLocal(val: string): string | null {
  if (!val) return null
  return new Date(val).toISOString()
}

function calcPnl(entry: string, exit: string, size: string, direction: TradeDirection | ''): string {
  const e = parseFloat(entry), x = parseFloat(exit), s = parseFloat(size)
  if (isNaN(e) || isNaN(x) || isNaN(s) || !direction) return ''
  const diff = direction === 'long' ? x - e : e - x
  return (diff * s).toFixed(2)
}

function initForm(trade?: TradeRecord): FormState {
  if (!trade) {
    return {
      instrument: '', direction: '', entry_price: '', exit_price: '', stop_loss: '',
      pnl: '', rr: '', position_size: '', opened_at: '', closed_at: '',
      emotion_tag: '', execution_score: 5, notes: '', followed_plan: null,
      session: '', setup_type: '', exit_reason: '', mistakes: [],
    }
  }
  return {
    instrument: trade.instrument ?? '',
    direction: trade.direction ?? '',
    entry_price: trade.entry_price !== null ? String(trade.entry_price) : '',
    exit_price: trade.exit_price !== null ? String(trade.exit_price) : '',
    stop_loss: trade.stop_loss !== null ? String(trade.stop_loss) : '',
    pnl: trade.pnl !== null ? String(trade.pnl) : '',
    rr: trade.rr ?? '',
    position_size: trade.position_size !== null ? String(trade.position_size) : '',
    opened_at: toDatetimeLocal(trade.opened_at),
    closed_at: toDatetimeLocal(trade.closed_at),
    emotion_tag: trade.emotion_tag ?? '',
    execution_score: trade.execution_score ?? 5,
    notes: trade.notes ?? '',
    followed_plan: trade.followed_plan ?? null,
    session: trade.session ?? '',
    setup_type: trade.setup_type ?? '',
    exit_reason: trade.exit_reason ?? '',
    mistakes: trade.mistakes ?? [],
  }
}

// ------------------------------------------------------------------
// Multi-select chip component for mistakes
// ------------------------------------------------------------------
function MistakeChips({ selected, onChange }: { selected: string[]; onChange: (v: string[]) => void }) {
  const toggle = (m: string) => {
    onChange(selected.includes(m) ? selected.filter(x => x !== m) : [...selected, m])
  }
  return (
    <div className="flex flex-wrap gap-2">
      {MISTAKE_OPTIONS.map(m => (
        <button
          key={m}
          type="button"
          onClick={() => toggle(m)}
          className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
            selected.includes(m)
              ? 'bg-red-500/20 border-red-500/50 text-red-400'
              : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
          }`}
        >
          {m}
        </button>
      ))}
    </div>
  )
}

export default function TradeDrawer({ isOpen, onClose, onSave, trade }: TradeDrawerProps) {
  const router = useRouter()
  const isEditMode = Boolean(trade)
  const [form, setForm] = useState<FormState>(initForm(trade))
  const [saving, setSaving] = useState(false)
  const [shaking, setShaking] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) { setForm(initForm(trade)); setErrors({}); setSaveError(null) }
  }, [isOpen, trade])

  const autoCalcPnl = useCallback((updated: FormState): string => {
    if (updated.entry_price && updated.exit_price && updated.position_size && updated.direction) {
      return calcPnl(updated.entry_price, updated.exit_price, updated.position_size, updated.direction)
    }
    return updated.pnl
  }, [])

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(prev => {
      const updated = { ...prev, [key]: value }
      if (['entry_price', 'exit_price', 'position_size', 'direction'].includes(key)) {
        updated.pnl = autoCalcPnl(updated)
      }
      return updated
    })
    setErrors(prev => ({ ...prev, [key]: undefined }))
  }

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof FormState, string>> = {}
    if (!form.instrument.trim()) newErrors.instrument = 'Instrument is required'
    if (!form.direction) newErrors.direction = 'Direction is required'
    if (!form.pnl && form.pnl !== '0') newErrors.pnl = 'P&L is required'
    if (!form.opened_at) newErrors.opened_at = 'Entry time is required'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSave = async () => {
    if (!validate()) {
      setShaking(true)
      setTimeout(() => setShaking(false), 400)
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const payload: Partial<TradeRecord> = {
        instrument: form.instrument.trim().toUpperCase(),
        direction: form.direction || null,
        entry_price: form.entry_price ? parseFloat(form.entry_price) : null,
        exit_price: form.exit_price ? parseFloat(form.exit_price) : null,
        stop_loss: form.stop_loss ? parseFloat(form.stop_loss) : null,
        pnl: form.pnl ? parseFloat(form.pnl) : null,
        rr: form.rr.trim() || null,
        position_size: form.position_size ? parseFloat(form.position_size) : null,
        opened_at: fromDatetimeLocal(form.opened_at),
        closed_at: fromDatetimeLocal(form.closed_at),
        emotion_tag: form.emotion_tag || null,
        execution_score: form.execution_score,
        notes: form.notes || null,
        followed_plan: form.followed_plan,
        session: form.session || null,
        setup_type: form.setup_type.trim() || null,
        exit_reason: form.exit_reason || null,
        mistakes: form.mistakes,
      }

      const url = isEditMode ? `/api/trades/${trade!.id}` : '/api/trades'
      const method = isEditMode ? 'PATCH' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) {
        const body = await res.json() as { error?: string }
        throw new Error(body.error ?? 'Failed to save trade')
      }
      if (isEditMode) {
        onSave()
      } else {
        const saved = await res.json() as { id?: string; trade?: { id: string } }
        const newId = saved.id ?? saved.trade?.id
        if (newId) {
          router.push(`/journal/${newId}`)
        } else {
          onSave()
        }
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save trade')
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && isOpen) onClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  return (
    <>
      {isOpen && <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} aria-hidden="true" />}

      <div
        className={`fixed top-0 right-0 h-full w-full max-w-[600px] bg-zinc-900 border-l border-zinc-800 z-50 flex flex-col shadow-2xl transition-transform duration-300 ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
        role="dialog" aria-modal="true" aria-label={isEditMode ? 'Edit trade' : 'Add trade'}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
          <h2 className="text-white font-semibold text-lg">{isEditMode ? 'Edit Trade' : 'Add Trade'}</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors" aria-label="Close">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Instrument */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Instrument <span className="text-red-400">*</span></label>
            <input
              type="text" value={form.instrument} onChange={(e) => setField('instrument', e.target.value)}
              placeholder="NQ, ES, AAPL..."
              className={`w-full bg-zinc-800 border text-white rounded-lg px-3 py-2.5 text-sm outline-none focus:border-blue-500 transition ${errors.instrument ? 'border-red-500' : 'border-zinc-700'}`}
            />
            {errors.instrument && <p className="text-red-400 text-xs mt-1">{errors.instrument}</p>}
          </div>

          {/* Direction */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Direction <span className="text-red-400">*</span></label>
            <div className={`flex gap-2 rounded-lg ${errors.direction ? 'ring-1 ring-red-500' : ''}`}>
              {(['long', 'short'] as TradeDirection[]).map(d => (
                <button key={d} type="button" onClick={() => setField('direction', form.direction === d ? '' : d)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all ${
                    form.direction === d
                      ? d === 'long' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'bg-red-500/20 border-red-500 text-red-400'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                  }`}
                >
                  {d === 'long' ? 'Long' : 'Short'}
                </button>
              ))}
            </div>
            {errors.direction && <p className="text-red-400 text-xs mt-1">{errors.direction}</p>}
          </div>

          {/* Price inputs */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Entry Price', key: 'entry_price' as const },
              { label: 'Exit Price',  key: 'exit_price'  as const },
              { label: 'Stop Loss',   key: 'stop_loss'   as const },
              { label: 'Position Size', key: 'position_size' as const, placeholder: '1' },
            ].map(f => (
              <div key={f.key}>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">{f.label}</label>
                <input type="number" step="any" value={form[f.key] as string}
                  onChange={(e) => setField(f.key, e.target.value)}
                  placeholder={f.placeholder ?? '0.00'}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2.5 text-sm outline-none focus:border-blue-500 transition"
                />
              </div>
            ))}
          </div>

          {/* P&L */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              P&L ($) <span className="text-red-400">*</span>
              <span className="text-zinc-600 ml-1 font-normal">(auto-calculated if prices set)</span>
            </label>
            <input type="number" step="any" value={form.pnl} onChange={(e) => setField('pnl', e.target.value)}
              placeholder="300.00"
              className={`w-full bg-zinc-800 border text-white rounded-lg px-3 py-2.5 text-sm outline-none focus:border-blue-500 transition ${errors.pnl ? 'border-red-500' : 'border-zinc-700'}`}
            />
            {errors.pnl && <p className="text-red-400 text-xs mt-1">{errors.pnl}</p>}
          </div>

          {/* R:R */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Risk/Reward <span className="text-zinc-600 font-normal">(e.g. 1:2, 2R)</span></label>
            <input type="text" value={form.rr} onChange={(e) => setField('rr', e.target.value)} placeholder="1:2"
              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2.5 text-sm outline-none focus:border-blue-500 transition"
            />
          </div>

          {/* Times */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Entry Time <span className="text-red-400">*</span></label>
              <input type="datetime-local" value={form.opened_at} onChange={(e) => setField('opened_at', e.target.value)}
                className={`w-full bg-zinc-800 border text-white rounded-lg px-3 py-2.5 text-sm outline-none focus:border-blue-500 transition ${errors.opened_at ? 'border-red-500' : 'border-zinc-700'}`}
              />
              {errors.opened_at && <p className="text-red-400 text-xs mt-1">{errors.opened_at}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Exit Time</label>
              <input type="datetime-local" value={form.closed_at} onChange={(e) => setField('closed_at', e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2.5 text-sm outline-none focus:border-blue-500 transition"
              />
            </div>
          </div>

          {/* Session */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Session</label>
            <div className="flex gap-2 flex-wrap">
              {SESSION_OPTIONS.map(s => (
                <button key={s.value} type="button" onClick={() => setField('session', form.session === s.value ? '' : s.value)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all min-w-[80px] ${
                    form.session === s.value
                      ? 'bg-blue-500/20 border-blue-500 text-blue-400'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Setup type */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Setup Type</label>
            <input type="text" value={form.setup_type} onChange={(e) => setField('setup_type', e.target.value)}
              placeholder="Breakout, pullback, VWAP reclaim..."
              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2.5 text-sm outline-none focus:border-blue-500 transition"
            />
          </div>

          {/* Exit reason */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Exit Reason</label>
            <div className="flex gap-2 flex-wrap">
              {EXIT_REASON_OPTIONS.map(r => (
                <button key={r} type="button" onClick={() => setField('exit_reason', form.exit_reason === r ? '' : r)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                    form.exit_reason === r
                      ? 'bg-zinc-600/40 border-zinc-500 text-zinc-200'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Mistakes */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              Mistakes <span className="text-zinc-600 font-normal">(select all that apply)</span>
            </label>
            <MistakeChips selected={form.mistakes} onChange={(v) => setField('mistakes', v)} />
          </div>

          {/* Emotion */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Emotion</label>
            <select value={form.emotion_tag} onChange={(e) => setField('emotion_tag', e.target.value as EmotionTag | '')}
              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2.5 text-sm outline-none focus:border-blue-500 transition"
            >
              <option value="">Select emotion...</option>
              {EMOTION_OPTIONS.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>

          {/* Execution score */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              Execution Score — <span className="text-white font-semibold">{form.execution_score}/10</span>
            </label>
            <input type="range" min={1} max={10} step={1} value={form.execution_score}
              onChange={(e) => setField('execution_score', parseInt(e.target.value, 10))}
              className="w-full accent-blue-500"
            />
            <div className="flex justify-between text-xs text-zinc-600 mt-1"><span>1</span><span>10</span></div>
          </div>

          {/* Followed plan */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Followed Plan?</label>
            <div className="flex gap-2">
              {([true, false] as const).map(val => (
                <button key={String(val)} type="button" onClick={() => setField('followed_plan', form.followed_plan === val ? null : val)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all ${
                    form.followed_plan === val
                      ? val ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'bg-red-500/20 border-red-500 text-red-400'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                  }`}
                >
                  {val ? 'Yes' : 'No'}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Notes</label>
            <textarea value={form.notes} onChange={(e) => setField('notes', e.target.value)}
              placeholder="What happened? What did you learn?" rows={4}
              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2.5 text-sm outline-none focus:border-blue-500 transition resize-none"
            />
          </div>

          {saveError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">{saveError}</div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-800 shrink-0">
          <div className="flex gap-3">
            <button onClick={onClose} disabled={saving}
              className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving}
              className={`flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50 ${shaking ? 'shake' : ''}`}
            >
              {saving ? 'Saving...' : isEditMode ? 'Save Changes' : 'Add Trade'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
