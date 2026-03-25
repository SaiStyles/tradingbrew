'use client'

import { useEffect, useState } from 'react'

interface DailyNoteProps {
  date: string // YYYY-MM-DD
}

export default function DailyNote({ date }: DailyNoteProps) {
  const [note, setNote] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!date) return
    setLoading(true)
    fetch(`/api/journal/daily-note?date=${date}`)
      .then(r => r.json())
      .then(data => setNote(data.note ?? null))
      .catch(() => setNote(null))
      .finally(() => setLoading(false))
  }, [date])

  if (loading) {
    return (
      <div className="rounded-xl border border-white/5 bg-white/[0.02] px-5 py-4">
        <div className="h-4 w-1/3 animate-pulse rounded bg-white/10" />
        <div className="mt-2 h-3 w-full animate-pulse rounded bg-white/10" />
        <div className="mt-1 h-3 w-4/5 animate-pulse rounded bg-white/10" />
      </div>
    )
  }

  if (!note) return null

  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] px-5 py-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-widest text-white/30">AI Note</p>
      <p className="text-sm leading-relaxed text-white/70">{note}</p>
    </div>
  )
}
