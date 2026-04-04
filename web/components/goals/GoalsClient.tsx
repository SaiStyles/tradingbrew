'use client'

import { useState, useRef, useEffect } from 'react'

type GoalType = 'performance' | 'psychology' | 'process' | 'risk'

interface Goal {
  id: string
  goal_text: string
  goal_type: GoalType
  is_completed: boolean
  week_start: string
  created_at: string
}

interface GoalsClientProps {
  initialCurrent: Goal[]
  initialLast: Goal[]
  currentWeekStart: string
  lastWeekStart: string
}

const GOAL_TYPES: { value: GoalType; label: string; color: string; bg: string; border: string; dot: string }[] = [
  { value: 'performance', label: 'Performance', color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/30',   dot: 'bg-blue-400' },
  { value: 'psychology',  label: 'Psychology',  color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/30', dot: 'bg-purple-400' },
  { value: 'process',     label: 'Process',     color: 'text-emerald-400',bg: 'bg-emerald-500/10',border: 'border-emerald-500/30',dot: 'bg-emerald-400' },
  { value: 'risk',        label: 'Risk',        color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30', dot: 'bg-orange-400' },
]

const SUGGESTIONS: { type: GoalType; text: string }[] = [
  { type: 'performance', text: 'Achieve 55%+ win rate this week' },
  { type: 'psychology',  text: 'No revenge trades after a loss' },
  { type: 'process',     text: 'Log every trade with emotion tag' },
  { type: 'risk',        text: 'Stop trading after 3 consecutive losses' },
  { type: 'performance', text: 'Minimum 1.5R on every trade' },
  { type: 'psychology',  text: 'Take a 10 min break after a losing trade' },
  { type: 'process',     text: 'Review journal at end of each session' },
  { type: 'risk',        text: 'Never risk more than 1% per trade' },
]

function formatWeekRange(weekStart: string): string {
  const start = new Date(weekStart + 'T00:00:00')
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
}

function ProgressRing({ completed, total }: { completed: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100)
  const radius = 36
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (pct / 100) * circumference

  const ringColor = pct >= 80 ? '#34d399' : pct >= 50 ? '#fbbf24' : pct > 0 ? '#f87171' : '#3f3f46'

  return (
    <div className="relative flex items-center justify-center w-24 h-24">
      <svg className="w-24 h-24 -rotate-90" viewBox="0 0 88 88">
        <circle cx="44" cy="44" r={radius} fill="none" stroke="#27272a" strokeWidth="7" />
        <circle
          cx="44" cy="44" r={radius} fill="none"
          stroke={ringColor} strokeWidth="7"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.5s ease, stroke 0.3s ease' }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-white text-xl font-bold leading-none">{pct}%</span>
        <span className="text-zinc-500 text-xs mt-0.5">{completed}/{total}</span>
      </div>
    </div>
  )
}

function GoalTypeBadge({ type }: { type: GoalType }) {
  const t = GOAL_TYPES.find(g => g.value === type) ?? GOAL_TYPES[2]
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border ${t.color} ${t.bg} ${t.border}`}>
      {t.label}
    </span>
  )
}

export default function GoalsClient({ initialCurrent, initialLast, currentWeekStart, lastWeekStart }: GoalsClientProps) {
  const [current, setCurrent] = useState<Goal[]>(initialCurrent)
  const [last] = useState<Goal[]>(initialLast)
  const [newText, setNewText] = useState('')
  const [newType, setNewType] = useState<GoalType>('process')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const completed = current.filter(g => g.is_completed).length
  const total = current.length

  useEffect(() => {
    if (current.length === 0) setShowSuggestions(true)
  }, [])

  const handleAdd = async () => {
    if (!newText.trim()) return
    setAdding(true)
    setAddError(null)
    try {
      const res = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal_text: newText.trim(), goal_type: newType }),
      })
      if (!res.ok) throw new Error('Failed to add goal')
      const { goal } = await res.json() as { goal: Goal }
      setCurrent(prev => [...prev, goal])
      setNewText('')
      setShowSuggestions(false)
      inputRef.current?.focus()
    } catch {
      setAddError('Failed to add goal')
    } finally {
      setAdding(false)
    }
  }

  const handleToggle = async (id: string, current_val: boolean) => {
    setCurrent(prev => prev.map(g => g.id === id ? { ...g, is_completed: !current_val } : g))
    try {
      await fetch(`/api/goals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_completed: !current_val }),
      })
    } catch {
      setCurrent(prev => prev.map(g => g.id === id ? { ...g, is_completed: current_val } : g))
    }
  }

  const handleDelete = async (id: string) => {
    setCurrent(prev => prev.filter(g => g.id !== id))
    try {
      await fetch(`/api/goals/${id}`, { method: 'DELETE' })
    } catch {
      // Ignore — optimistic delete
    }
  }

  const addSuggestion = (s: { type: GoalType; text: string }) => {
    setNewText(s.text)
    setNewType(s.type)
    setShowSuggestions(false)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const lastCompleted = last.filter(g => g.is_completed).length
  const lastTotal = last.length

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-2xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Weekly Goals</h1>
          <p className="text-zinc-500 text-sm mt-1">Set intentions. Hold yourself accountable.</p>
        </div>

        {/* Current week */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 mb-6">

          {/* Week header + ring */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1">This Week</p>
              <p className="text-white font-semibold">{formatWeekRange(currentWeekStart)}</p>
              {total > 0 && (
                <p className="text-zinc-500 text-sm mt-1">
                  {total - completed > 0
                    ? `${total - completed} goal${total - completed !== 1 ? 's' : ''} remaining`
                    : '🎯 All goals complete!'}
                </p>
              )}
            </div>
            <ProgressRing completed={completed} total={total} />
          </div>

          {/* Goal list */}
          {current.length > 0 && (
            <div className="space-y-2 mb-5">
              {current.map(goal => (
                <div
                  key={goal.id}
                  className={`group flex items-center gap-3 p-3 rounded-xl border transition-all ${
                    goal.is_completed
                      ? 'bg-zinc-800/40 border-zinc-800'
                      : 'bg-zinc-800/60 border-zinc-700 hover:border-zinc-600'
                  }`}
                >
                  {/* Checkbox */}
                  <button
                    onClick={() => handleToggle(goal.id, goal.is_completed)}
                    className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                      goal.is_completed
                        ? 'bg-emerald-500 border-emerald-500'
                        : 'border-zinc-600 hover:border-zinc-400'
                    }`}
                  >
                    {goal.is_completed && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>

                  {/* Text */}
                  <span className={`flex-1 text-sm ${goal.is_completed ? 'line-through text-zinc-500' : 'text-white'}`}>
                    {goal.goal_text}
                  </span>

                  {/* Type badge */}
                  <GoalTypeBadge type={goal.goal_type as GoalType} />

                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(goal.id)}
                    className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all ml-1"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {current.length === 0 && (
            <div className="text-center py-6 mb-5">
              <p className="text-zinc-500 text-sm">No goals set for this week.</p>
              <p className="text-zinc-600 text-xs mt-1">What do you want to achieve?</p>
            </div>
          )}

          {/* Add input */}
          <div className="flex gap-2">
            <div className="flex-1 flex items-center gap-2 bg-zinc-800 border border-zinc-700 rounded-xl px-3 focus-within:border-zinc-500 transition-colors">
              {/* Type dot picker */}
              <div className="relative flex-shrink-0">
                <div className="flex gap-1">
                  {GOAL_TYPES.map(t => (
                    <button
                      key={t.value}
                      onClick={() => setNewType(t.value)}
                      title={t.label}
                      className={`w-2.5 h-2.5 rounded-full transition-all ${t.dot} ${newType === t.value ? 'ring-2 ring-white ring-offset-1 ring-offset-zinc-800 scale-125' : 'opacity-40 hover:opacity-80'}`}
                    />
                  ))}
                </div>
              </div>
              <input
                ref={inputRef}
                type="text"
                value={newText}
                onChange={e => setNewText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
                placeholder="Add a goal... (Enter to save)"
                className="flex-1 bg-transparent text-white text-sm placeholder-zinc-600 outline-none py-2.5"
              />
            </div>
            <button
              onClick={handleAdd}
              disabled={adding || !newText.trim()}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {adding ? '...' : 'Add'}
            </button>
          </div>
          {addError && <p className="text-red-400 text-xs mt-2">{addError}</p>}

          {/* Type legend */}
          <div className="flex flex-wrap gap-3 mt-3">
            {GOAL_TYPES.map(t => (
              <button
                key={t.value}
                onClick={() => setNewType(t.value)}
                className={`flex items-center gap-1.5 text-xs transition-opacity ${newType === t.value ? 'opacity-100' : 'opacity-40 hover:opacity-70'}`}
              >
                <span className={`w-2 h-2 rounded-full ${t.dot}`} />
                <span className={t.color}>{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Suggestions */}
        {showSuggestions && current.length === 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 mb-6">
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-4">Suggested Goals</p>
            <div className="grid grid-cols-1 gap-2">
              {SUGGESTIONS.map((s, i) => {
                const t = GOAL_TYPES.find(g => g.value === s.type)!
                return (
                  <button
                    key={i}
                    onClick={() => addSuggestion(s)}
                    className="flex items-center gap-3 p-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-left transition-all group"
                  >
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${t.dot}`} />
                    <span className="text-zinc-300 text-sm group-hover:text-white transition-colors flex-1">{s.text}</span>
                    <span className={`text-xs ${t.color} opacity-60`}>{t.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Last week */}
        {lastTotal > 0 && (
          <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs font-medium text-zinc-600 uppercase tracking-wide mb-1">Last Week</p>
                <p className="text-zinc-400 text-sm">{formatWeekRange(lastWeekStart)}</p>
              </div>
              <div className="text-right">
                <p className={`text-lg font-bold ${lastCompleted === lastTotal ? 'text-emerald-400' : lastCompleted >= lastTotal * 0.5 ? 'text-amber-400' : 'text-zinc-400'}`}>
                  {lastCompleted}/{lastTotal}
                </p>
                <p className="text-zinc-600 text-xs">completed</p>
              </div>
            </div>
            <div className="space-y-2">
              {last.map(goal => (
                <div key={goal.id} className="flex items-center gap-3 p-3 rounded-xl bg-zinc-800/20 border border-zinc-800/50">
                  <div className={`w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center ${goal.is_completed ? 'bg-emerald-500/30' : 'border border-zinc-700'}`}>
                    {goal.is_completed && (
                      <svg className="w-2.5 h-2.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <span className={`flex-1 text-sm ${goal.is_completed ? 'line-through text-zinc-600' : 'text-zinc-500'}`}>
                    {goal.goal_text}
                  </span>
                  <GoalTypeBadge type={goal.goal_type as GoalType} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
