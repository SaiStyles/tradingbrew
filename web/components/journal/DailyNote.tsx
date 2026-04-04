'use client'

import { useEffect, useRef, useState } from 'react'

interface DailyNoteProps {
  date: string    // YYYY-MM-DD
  timezone: string
}

export default function DailyNote({ date, timezone }: DailyNoteProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Only fetch when scrolled into view — prevents 28 simultaneous calls on journal load
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsVisible(true)
        observer.disconnect()
      }
    }, { rootMargin: '200px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!isVisible || !date) return
    setLoading(true)
    fetch(`/api/journal/daily-note?date=${date}&timezone=${encodeURIComponent(timezone)}`)
      .then(r => r.json())
      .then(data => setNote(data.note ?? null))
      .catch(() => setNote(null))
      .finally(() => setLoading(false))
  }, [isVisible, date])

  if (loading && !isVisible) return <div ref={ref} />

  if (loading) {
    return (
      <div ref={ref} className="rounded-xl border border-white/5 bg-white/[0.02] px-5 py-4">
        <div className="h-4 w-1/3 animate-pulse rounded bg-white/10" />
        <div className="mt-2 h-3 w-full animate-pulse rounded bg-white/10" />
        <div className="mt-1 h-3 w-4/5 animate-pulse rounded bg-white/10" />
      </div>
    )
  }

  if (!note) return <div ref={ref} />

  return (
    <div ref={ref} className="rounded-xl border border-white/5 bg-white/[0.02] px-5 py-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-widest text-white/30">AI Note</p>
      <p className="text-sm leading-relaxed text-white/70">{note}</p>
    </div>
  )
}
