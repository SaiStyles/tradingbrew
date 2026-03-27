'use client'

import { useMemo, useState } from 'react'
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts'

// ─── Types ──────────────────────────────────────────────────────────────────

type Trade = {
  id: string
  pnl: number
  opened_at: string
  instrument: string | null
  emotion_tag: string | null
  execution_score: number | null
  followed_plan: boolean | null
  direction: string | null
}

type Range = '7D' | 'MTD' | '30D' | '3M' | 'All'

// ─── Constants ──────────────────────────────────────────────────────────────

const RANGES: { label: string; value: Range }[] = [
  { label: '7D', value: '7D' },
  { label: 'MTD', value: 'MTD' },
  { label: '30D', value: '30D' },
  { label: '3M', value: '3M' },
  { label: 'All', value: 'All' },
]

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const EMOTION_LABELS: Record<string, string> = {
  confident: 'Confident',
  hesitant: 'Hesitant',
  FOMO: 'FOMO',
  revenge: 'Revenge',
  bored: 'Bored',
  calm: 'Calm',
  frustrated: 'Frustrated',
  euphoric: 'Euphoric',
}

const C = {
  equity: '#a78bfa',
  positive: '#22c55e',
  negative: '#ef4444',
  grid: '#27272a',
  axis: '#52525b',
}

// ─── Utilities ──────────────────────────────────────────────────────────────

function getCutoff(range: Range): Date | null {
  const now = new Date()
  switch (range) {
    case '7D': { const d = new Date(now); d.setDate(d.getDate() - 7); return d }
    case 'MTD': return new Date(now.getFullYear(), now.getMonth(), 1)
    case '30D': { const d = new Date(now); d.setDate(d.getDate() - 30); return d }
    case '3M': { const d = new Date(now); d.setMonth(d.getMonth() - 3); return d }
    case 'All': return null
  }
}

function fmt$(n: number, decimals = 0): string {
  const abs = Math.abs(n)
  const s = abs.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  return n < 0 ? `-$${s}` : `$${s}`
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`
}

function colorClass(n: number): string {
  return n >= 0 ? 'text-green-400' : 'text-red-400'
}

function calColor(pnl: number | null): string {
  if (pnl === null) return '#27272a'
  if (pnl === 0) return '#3f3f46'
  if (pnl > 500) return '#15803d'
  if (pnl > 200) return '#16a34a'
  if (pnl > 0) return '#22c55e50'
  if (pnl > -200) return '#ef444450'
  if (pnl > -500) return '#dc2626'
  return '#991b1b'
}

// ─── Custom tooltip ──────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: {
  active?: boolean
  payload?: { name: string; value: number; color?: string }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs">
      {label && <p className="text-zinc-400 mb-1">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || '#fff' }}>
          {p.name}: {typeof p.value === 'number' ? fmt$(p.value) : p.value}
        </p>
      ))}
    </div>
  )
}

function PFTooltip({ active, payload, label }: {
  active?: boolean
  payload?: { name: string; value: number }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs">
      {label && <p className="text-zinc-400 mb-1">Trade #{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="text-violet-300">{p.name}: {p.value}</p>
      ))}
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function KPICard({ label, value, valueColor, sub }: {
  label: string
  value: string
  valueColor: string
  sub?: string
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <p className="text-zinc-500 text-xs mb-1">{label}</p>
      <p className={`text-xl font-bold ${valueColor}`}>{value}</p>
      {sub && <p className="text-zinc-600 text-xs mt-1">{sub}</p>}
    </div>
  )
}

function ChartCard({ title, subtitle, children }: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <p className="text-sm font-semibold text-zinc-300 mb-0.5">{title}</p>
      {subtitle && <p className="text-xs text-zinc-500 mb-3">{subtitle}</p>}
      {children}
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export function StatsClient({ trades }: { trades: Trade[] }) {
  const [range, setRange] = useState<Range>('30D')

  // ── Filter by range ────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const cutoff = getCutoff(range)
    if (!cutoff) return trades
    return trades.filter(t => new Date(t.opened_at) >= cutoff)
  }, [trades, range])

  // ── Core metrics ──────────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    if (filtered.length === 0) return null

    const wins = filtered.filter(t => t.pnl > 0)
    const losses = filtered.filter(t => t.pnl < 0)
    const totalPnl = filtered.reduce((s, t) => s + t.pnl, 0)
    const winRate = wins.length / filtered.length
    const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0
    const avgLoss = losses.length > 0 ? losses.reduce((s, t) => s + t.pnl, 0) / losses.length : 0
    const grossWin = wins.reduce((s, t) => s + t.pnl, 0)
    const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0))
    const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0
    const expectancy = winRate * avgWin + (1 - winRate) * avgLoss
    const largestWin = wins.length > 0 ? Math.max(...wins.map(t => t.pnl)) : 0
    const largestLoss = losses.length > 0 ? Math.min(...losses.map(t => t.pnl)) : 0

    // Daily PnL → Sharpe
    const dailyMap: Record<string, number> = {}
    filtered.forEach(t => {
      const day = t.opened_at.split('T')[0]
      dailyMap[day] = (dailyMap[day] || 0) + t.pnl
    })
    const dailyVals = Object.values(dailyMap)
    const meanDaily = dailyVals.reduce((s, v) => s + v, 0) / (dailyVals.length || 1)
    const variance = dailyVals.reduce((s, v) => s + (v - meanDaily) ** 2, 0) / (dailyVals.length || 1)
    const stddev = Math.sqrt(variance)
    const sharpe = stddev > 0 ? (meanDaily / stddev) * Math.sqrt(252) : 0

    // Equity curve + drawdown
    const sorted = [...filtered].sort(
      (a, b) => new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime()
    )
    let cumulative = 0
    let peak = 0
    let maxDrawdown = 0
    const equityByDay: Record<string, number> = {}
    sorted.forEach(t => {
      const day = t.opened_at.split('T')[0]
      equityByDay[day] = (equityByDay[day] || 0) + t.pnl
    })
    const equityCurve = Object.entries(equityByDay).sort().map(([date, dailyPnl]) => {
      cumulative += dailyPnl
      if (cumulative > peak) peak = cumulative
      const drawdown = cumulative - peak
      if (-drawdown > maxDrawdown) maxDrawdown = -drawdown
      return {
        date: date.slice(5),
        equity: Math.round(cumulative * 100) / 100,
        drawdown: Math.round(drawdown * 100) / 100,
        daily: Math.round(dailyPnl * 100) / 100,
      }
    })

    // Recovery Factor / Calmar
    const recoveryFactor = maxDrawdown > 0 ? totalPnl / maxDrawdown : totalPnl > 0 ? 99 : 0

    // Consistency score — best day / total PnL (prop firm metric)
    const bestDayPnl = equityCurve.length > 0 ? Math.max(...equityCurve.map(d => d.daily)) : 0
    const consistencyScore = totalPnl > 0 && bestDayPnl > 0 ? bestDayPnl / totalPnl : 0

    // Current streak
    let streak = 0
    let streakType: 'win' | 'loss' | null = null
    for (let i = sorted.length - 1; i >= 0; i--) {
      const isWin = sorted[i].pnl > 0
      if (streakType === null) { streakType = isWin ? 'win' : 'loss'; streak = 1 }
      else if ((streakType === 'win') === isWin) streak++
      else break
    }

    return {
      totalPnl, winRate, avgWin, avgLoss, grossWin, grossLoss,
      profitFactor, expectancy, sharpe, maxDrawdown, recoveryFactor,
      largestWin, largestLoss, equityCurve,
      consistencyScore, streak, streakType,
      daysTraded: dailyVals.length,
      total: filtered.length,
      wins: wins.length,
      losses: losses.length,
    }
  }, [filtered])

  // ── By instrument ─────────────────────────────────────────────────────────
  const byInstrument = useMemo(() => {
    const map: Record<string, { pnl: number; wins: number; total: number }> = {}
    filtered.forEach(t => {
      const k = t.instrument || 'Unknown'
      if (!map[k]) map[k] = { pnl: 0, wins: 0, total: 0 }
      map[k].pnl += t.pnl
      map[k].total++
      if (t.pnl > 0) map[k].wins++
    })
    return Object.entries(map)
      .map(([instrument, d]) => ({
        instrument,
        pnl: Math.round(d.pnl * 100) / 100,
        winRate: Math.round((d.wins / d.total) * 100),
        trades: d.total,
      }))
      .sort((a, b) => b.trades - a.trades)
      .slice(0, 10)
  }, [filtered])

  // ── By day of week ────────────────────────────────────────────────────────
  const byDow = useMemo(() => {
    const map: Record<string, { pnl: number; count: number }> = {}
    for (let i = 0; i <= 6; i++) map[String(i)] = { pnl: 0, count: 0 }
    filtered.forEach(t => {
      const dow = String(new Date(t.opened_at).getDay())
      map[dow].pnl += t.pnl
      map[dow].count++
    })
    return Object.entries(map)
      .filter(([, d]) => d.count > 0)
      .map(([dow, d]) => ({
        day: DOW_LABELS[Number(dow)],
        avgPnl: Math.round((d.pnl / d.count) * 100) / 100,
        total: Math.round(d.pnl * 100) / 100,
        trades: d.count,
      }))
  }, [filtered])

  // ── By hour of day ────────────────────────────────────────────────────────
  const byHour = useMemo(() => {
    const map: Record<string, { pnl: number; count: number }> = {}
    filtered.forEach(t => {
      const h = String(new Date(t.opened_at).getHours())
      if (!map[h]) map[h] = { pnl: 0, count: 0 }
      map[h].pnl += t.pnl
      map[h].count++
    })
    return Object.entries(map)
      .map(([hour, d]) => ({
        hour: `${hour.padStart(2, '0')}:00`,
        avgPnl: Math.round((d.pnl / d.count) * 100) / 100,
        trades: d.count,
      }))
      .sort((a, b) => a.hour.localeCompare(b.hour))
  }, [filtered])

  // ── By emotion ────────────────────────────────────────────────────────────
  const byEmotion = useMemo(() => {
    const map: Record<string, { pnl: number; count: number; wins: number }> = {}
    filtered.forEach(t => {
      const k = t.emotion_tag || 'untagged'
      if (!map[k]) map[k] = { pnl: 0, count: 0, wins: 0 }
      map[k].pnl += t.pnl
      map[k].count++
      if (t.pnl > 0) map[k].wins++
    })
    return Object.entries(map)
      .map(([emotion, d]) => ({
        emotion: EMOTION_LABELS[emotion] || emotion,
        avgPnl: Math.round((d.pnl / d.count) * 100) / 100,
        winRate: Math.round((d.wins / d.count) * 100),
        trades: d.count,
      }))
      .sort((a, b) => b.avgPnl - a.avgPnl)
  }, [filtered])

  // ── Plan adherence ────────────────────────────────────────────────────────
  const planComparison = useMemo(() => {
    const tagged = filtered.filter(t => t.followed_plan !== null)
    const followed = tagged.filter(t => t.followed_plan === true)
    const deviated = tagged.filter(t => t.followed_plan === false)
    const stat = (arr: Trade[]) => ({
      avgPnl: arr.length > 0 ? Math.round((arr.reduce((s, t) => s + t.pnl, 0) / arr.length) * 100) / 100 : 0,
      winRate: arr.length > 0 ? Math.round((arr.filter(t => t.pnl > 0).length / arr.length) * 100) : 0,
      count: arr.length,
    })
    return [
      { label: 'Followed Plan', ...stat(followed) },
      { label: 'Deviated', ...stat(deviated) },
    ]
  }, [filtered])

  // ── Execution score vs PnL ────────────────────────────────────────────────
  const execData = useMemo(() => {
    const map: Record<string, { pnl: number; count: number }> = {}
    filtered.forEach(t => {
      if (t.execution_score == null) return
      const k = String(t.execution_score)
      if (!map[k]) map[k] = { pnl: 0, count: 0 }
      map[k].pnl += t.pnl
      map[k].count++
    })
    return Object.entries(map)
      .map(([score, d]) => ({
        score: Number(score),
        avgPnl: Math.round((d.pnl / d.count) * 100) / 100,
        trades: d.count,
      }))
      .sort((a, b) => a.score - b.score)
  }, [filtered])

  // ── Trade distribution histogram ──────────────────────────────────────────
  const tradeDistribution = useMemo(() => {
    const buckets = [
      { label: '< -500', min: -Infinity, max: -500, pos: false },
      { label: '-500 to -200', min: -500, max: -200, pos: false },
      { label: '-200 to 0', min: -200, max: 0, pos: false },
      { label: '0 to 200', min: 0, max: 200, pos: true },
      { label: '200 to 500', min: 200, max: 500, pos: true },
      { label: '> 500', min: 500, max: Infinity, pos: true },
    ]
    return buckets.map(b => ({
      range: b.label,
      count: filtered.filter(t => t.pnl >= b.min && t.pnl < b.max).length,
      isPositive: b.pos,
    }))
  }, [filtered])

  // ── Rolling profit factor (20-trade window) ───────────────────────────────
  const rollingPF = useMemo(() => {
    if (filtered.length < 10) return []
    const sorted = [...filtered].sort(
      (a, b) => new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime()
    )
    const WINDOW = Math.min(20, Math.floor(sorted.length / 2))
    return sorted.slice(WINDOW - 1).map((_, i) => {
      const window = sorted.slice(i, i + WINDOW)
      const gw = window.filter(t => t.pnl > 0).reduce((s, t) => s + t.pnl, 0)
      const gl = Math.abs(window.filter(t => t.pnl < 0).reduce((s, t) => s + t.pnl, 0))
      return {
        trade: i + WINDOW,
        pf: gl > 0 ? Math.round((gw / gl) * 100) / 100 : gw > 0 ? 5 : 0,
      }
    })
  }, [filtered])

  // ── Calendar heatmap (last 13 weeks, all-time data) ───────────────────────
  const calendarData = useMemo(() => {
    const dailyPnl: Record<string, number> = {}
    trades.forEach(t => {
      const day = t.opened_at.split('T')[0]
      dailyPnl[day] = (dailyPnl[day] || 0) + t.pnl
    })
    const today = new Date()
    const start = new Date(today)
    start.setDate(start.getDate() - 90)
    start.setDate(start.getDate() - start.getDay()) // align to Sunday
    const days: { date: string; pnl: number | null; dow: number }[] = []
    const cur = new Date(start)
    while (cur <= today) {
      const dateStr = cur.toISOString().split('T')[0]
      days.push({ date: dateStr, pnl: dailyPnl[dateStr] ?? null, dow: cur.getDay() })
      cur.setDate(cur.getDate() + 1)
    }
    return days
  }, [trades])

  // Group calendar into weeks
  const calWeeks = useMemo(() => {
    const weeks: { date: string; pnl: number | null; dow: number }[][] = []
    let week: { date: string; pnl: number | null; dow: number }[] = []
    calendarData.forEach((day, i) => {
      if (i > 0 && day.dow === 0) { weeks.push(week); week = [] }
      week.push(day)
    })
    if (week.length > 0) weeks.push(week)
    return weeks
  }, [calendarData])

  // ── Range tabs + empty state ───────────────────────────────────────────────
  const rangeTabs = (
    <div className="flex gap-1 mb-6">
      {RANGES.map(r => (
        <button
          key={r.value}
          onClick={() => setRange(r.value)}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
            range === r.value
              ? 'bg-violet-600 text-white'
              : 'bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800'
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  )

  if (!metrics || filtered.length === 0) {
    return (
      <div>
        {rangeTabs}
        <div className="flex items-center justify-center h-64 text-zinc-500 text-sm">
          No trades in this period.
        </div>
      </div>
    )
  }

  const pfColor = metrics.profitFactor >= 1.5
    ? 'text-green-400'
    : metrics.profitFactor >= 1.0
    ? 'text-yellow-400'
    : 'text-red-400'

  const sharpeColor = metrics.sharpe >= 2
    ? 'text-green-400'
    : metrics.sharpe >= 1
    ? 'text-yellow-400'
    : 'text-red-400'

  const streakLabel = metrics.streakType === 'win'
    ? `${metrics.streak}W streak`
    : metrics.streakType === 'loss'
    ? `${metrics.streak}L streak`
    : '—'

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 pb-12">
      {rangeTabs}

      {/* ── KPI Row 1 — Core ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-4">
        <KPICard
          label="Net P&L"
          value={fmt$(metrics.totalPnl)}
          valueColor={colorClass(metrics.totalPnl)}
          sub={`${metrics.total} trades across ${metrics.daysTraded} days`}
        />
        <KPICard
          label="Win Rate"
          value={fmtPct(metrics.winRate)}
          valueColor={metrics.winRate >= 0.5 ? 'text-green-400' : 'text-red-400'}
          sub={`${metrics.wins}W / ${metrics.losses}L`}
        />
        <KPICard
          label="Profit Factor"
          value={metrics.profitFactor >= 99 ? '∞' : metrics.profitFactor.toFixed(2)}
          valueColor={pfColor}
          sub={metrics.profitFactor >= 1.5 ? 'Strong edge' : metrics.profitFactor >= 1.0 ? 'Marginal' : 'Losing edge'}
        />
        <KPICard
          label="Expectancy"
          value={fmt$(metrics.expectancy, 2)}
          valueColor={colorClass(metrics.expectancy)}
          sub="Expected per trade"
        />
      </div>

      {/* ── KPI Row 2 — Risk ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-4">
        <KPICard
          label="Sharpe Ratio"
          value={metrics.sharpe.toFixed(2)}
          valueColor={sharpeColor}
          sub="Annualized (252 days)"
        />
        <KPICard
          label="Max Drawdown"
          value={fmt$(metrics.maxDrawdown)}
          valueColor="text-red-400"
          sub="Peak-to-trough"
        />
        <KPICard
          label="Recovery Factor"
          value={metrics.recoveryFactor >= 99 ? '∞' : metrics.recoveryFactor.toFixed(2)}
          valueColor={metrics.recoveryFactor >= 3 ? 'text-green-400' : 'text-zinc-300'}
          sub="Net PnL / Max DD"
        />
        <KPICard
          label="Avg Win / Avg Loss"
          value={`${fmt$(metrics.avgWin)} / ${fmt$(Math.abs(metrics.avgLoss))}`}
          valueColor="text-white"
          sub={
            metrics.avgLoss !== 0
              ? `Ratio: ${(metrics.avgWin / Math.abs(metrics.avgLoss)).toFixed(2)}`
              : 'No losses'
          }
        />
      </div>

      {/* ── KPI Row 3 — Extras ────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-4">
        <KPICard
          label="Largest Win"
          value={fmt$(metrics.largestWin)}
          valueColor="text-green-400"
        />
        <KPICard
          label="Largest Loss"
          value={fmt$(metrics.largestLoss)}
          valueColor="text-red-400"
        />
        <KPICard
          label="Consistency Score"
          value={fmtPct(metrics.consistencyScore)}
          valueColor={metrics.consistencyScore <= 0.4 ? 'text-green-400' : 'text-red-400'}
          sub={metrics.consistencyScore <= 0.4 ? 'Consistent (prop-friendly)' : 'Best day dominates'}
        />
        <KPICard
          label="Current Streak"
          value={streakLabel}
          valueColor={metrics.streakType === 'win' ? 'text-green-400' : metrics.streakType === 'loss' ? 'text-red-400' : 'text-zinc-400'}
        />
      </div>

      {/* ── Equity Curve ─────────────────────────────────────────────────── */}
      <ChartCard title="Equity Curve" subtitle="Cumulative P&L — violet line. Red shading = open drawdown.">
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={metrics.equityCurve} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <defs>
              <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
            <XAxis dataKey="date" stroke={C.axis} tick={{ fontSize: 11 }} />
            <YAxis stroke={C.axis} tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
            <Tooltip content={<ChartTooltip />} />
            <ReferenceLine y={0} stroke={C.axis} strokeDasharray="4 4" />
            <Area
              dataKey="equity"
              name="Equity"
              stroke={C.equity}
              fill="url(#equityGrad)"
              strokeWidth={2}
              dot={false}
            />
            <Area
              dataKey="drawdown"
              name="Drawdown"
              stroke="#ef4444"
              fill="url(#ddGrad)"
              strokeWidth={1}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* ── Daily PnL + Distribution ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">
        <ChartCard title="Daily P&L" subtitle="Green = profitable day, red = losing day">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={metrics.equityCurve} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
              <XAxis dataKey="date" stroke={C.axis} tick={{ fontSize: 10 }} />
              <YAxis stroke={C.axis} tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
              <Tooltip formatter={(v: unknown) => fmt$(v as number)} labelFormatter={(l) => `Date: ${l}`} />
              <ReferenceLine y={0} stroke={C.axis} />
              <Bar dataKey="daily" name="P&L" radius={[2, 2, 0, 0]}>
                {metrics.equityCurve.map((entry, i) => (
                  <Cell key={i} fill={entry.daily >= 0 ? C.positive : C.negative} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Trade Distribution" subtitle="How your wins and losses are sized">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={tradeDistribution} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
              <XAxis dataKey="range" stroke={C.axis} tick={{ fontSize: 9 }} />
              <YAxis stroke={C.axis} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="count" name="Trades" radius={[2, 2, 0, 0]}>
                {tradeDistribution.map((entry, i) => (
                  <Cell key={i} fill={entry.isPositive ? C.positive : C.negative} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* ── Day of Week + Hour of Day ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">
        <ChartCard title="P&L by Day of Week" subtitle="Average P&L on each trading day">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={byDow} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
              <XAxis dataKey="day" stroke={C.axis} tick={{ fontSize: 12 }} />
              <YAxis stroke={C.axis} tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
              <Tooltip formatter={(v: unknown) => fmt$(v as number)} />
              <ReferenceLine y={0} stroke={C.axis} />
              <Bar dataKey="avgPnl" name="Avg P&L" radius={[2, 2, 0, 0]}>
                {byDow.map((entry, i) => (
                  <Cell key={i} fill={entry.avgPnl >= 0 ? C.positive : C.negative} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="P&L by Hour of Day" subtitle="Avg P&L per hour — discover your best session">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={byHour} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
              <XAxis dataKey="hour" stroke={C.axis} tick={{ fontSize: 9 }} />
              <YAxis stroke={C.axis} tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
              <Tooltip formatter={(v: unknown) => fmt$(v as number)} />
              <ReferenceLine y={0} stroke={C.axis} />
              <Bar dataKey="avgPnl" name="Avg P&L" radius={[2, 2, 0, 0]}>
                {byHour.map((entry, i) => (
                  <Cell key={i} fill={entry.avgPnl >= 0 ? C.positive : C.negative} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* ── By Instrument ────────────────────────────────────────────────── */}
      {byInstrument.length > 0 && (
        <ChartCard title="P&L by Instrument" subtitle="Where your edge lives (and doesn't)">
          <ResponsiveContainer width="100%" height={Math.max(160, byInstrument.length * 44)}>
            <BarChart
              data={byInstrument}
              layout="vertical"
              margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} horizontal={false} />
              <XAxis
                type="number"
                stroke={C.axis}
                tick={{ fontSize: 10 }}
                tickFormatter={(v) => `$${v}`}
              />
              <YAxis
                dataKey="instrument"
                type="category"
                stroke={C.axis}
                tick={{ fontSize: 12 }}
                width={55}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  const d = byInstrument.find(b => b.instrument === label)
                  return (
                    <div className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs">
                      <p className="text-zinc-300 font-semibold mb-1">{label}</p>
                      <p className={colorClass(payload[0].value as number)}>P&L: {fmt$(payload[0].value as number)}</p>
                      {d && <p className="text-zinc-400">{d.trades} trades · {d.winRate}% WR</p>}
                    </div>
                  )
                }}
              />
              <Bar dataKey="pnl" name="P&L" radius={[0, 2, 2, 0]}>
                {byInstrument.map((entry, i) => (
                  <Cell key={i} fill={entry.pnl >= 0 ? C.positive : C.negative} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* ── Psychology ───────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-base font-semibold text-zinc-200 mb-4">Psychology</h2>
        <div className="grid grid-cols-2 gap-4">
          {byEmotion.length > 0 && (
            <ChartCard title="Emotion vs Avg P&L" subtitle="Your P&L in each emotional state — AI-inferred">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={byEmotion} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
                  <XAxis dataKey="emotion" stroke={C.axis} tick={{ fontSize: 10 }} />
                  <YAxis stroke={C.axis} tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null
                      const d = byEmotion.find(b => b.emotion === label)
                      return (
                        <div className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs">
                          <p className="text-zinc-300 font-semibold mb-1">{label}</p>
                          <p className={colorClass(payload[0].value as number)}>Avg P&L: {fmt$(payload[0].value as number)}</p>
                          {d && <p className="text-zinc-400">{d.trades} trades · {d.winRate}% WR</p>}
                        </div>
                      )
                    }}
                  />
                  <ReferenceLine y={0} stroke={C.axis} />
                  <Bar dataKey="avgPnl" name="Avg P&L" radius={[2, 2, 0, 0]}>
                    {byEmotion.map((entry, i) => (
                      <Cell key={i} fill={entry.avgPnl >= 0 ? C.positive : C.negative} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {planComparison.some(p => p.count > 0) && (
            <ChartCard title="Plan Adherence" subtitle="Win rate and avg P&L — disciplined vs. impulse trades">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={planComparison} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
                  <XAxis dataKey="label" stroke={C.axis} tick={{ fontSize: 12 }} />
                  <YAxis stroke={C.axis} tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
                  <Tooltip formatter={(v: unknown) => fmt$(v as number)} />
                  <ReferenceLine y={0} stroke={C.axis} />
                  <Bar dataKey="avgPnl" name="Avg P&L" radius={[2, 2, 0, 0]}>
                    {planComparison.map((entry, i) => (
                      <Cell key={i} fill={entry.avgPnl >= 0 ? C.positive : C.negative} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex gap-6 mt-2 text-xs text-zinc-500">
                {planComparison.filter(p => p.count > 0).map(p => (
                  <span key={p.label}>{p.label}: {p.count} trades · {p.winRate}% WR</span>
                ))}
              </div>
            </ChartCard>
          )}
        </div>

        {execData.length > 0 && (
          <div className="mt-4">
            <ChartCard
              title="Execution Score vs P&L"
              subtitle="Average P&L by your self-rated execution quality (1–10)"
            >
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={execData} margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
                  <XAxis dataKey="score" stroke={C.axis} tick={{ fontSize: 12 }} />
                  <YAxis stroke={C.axis} tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null
                      const d = execData.find(e => e.score === Number(label))
                      return (
                        <div className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs">
                          <p className="text-zinc-400 mb-1">Score {label}/10</p>
                          <p className={colorClass(payload[0].value as number)}>Avg P&L: {fmt$(payload[0].value as number)}</p>
                          {d && <p className="text-zinc-400">{d.trades} trades</p>}
                        </div>
                      )
                    }}
                  />
                  <ReferenceLine y={0} stroke={C.axis} />
                  <Bar dataKey="avgPnl" name="Avg P&L" radius={[2, 2, 0, 0]}>
                    {execData.map((entry, i) => (
                      <Cell key={i} fill={entry.avgPnl >= 0 ? C.positive : C.negative} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        )}
      </div>

      {/* ── Rolling Profit Factor ─────────────────────────────────────────── */}
      {rollingPF.length > 2 && (
        <ChartCard
          title="Rolling Profit Factor"
          subtitle={`${Math.min(20, Math.floor(filtered.length / 2))}-trade rolling window — is your edge improving or decaying?`}
        >
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={rollingPF} margin={{ top: 5, right: 10, left: 5, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
              <XAxis
                dataKey="trade"
                stroke={C.axis}
                tick={{ fontSize: 10 }}
                label={{ value: 'Trade #', position: 'insideBottom', offset: -10, fill: '#52525b', fontSize: 11 }}
              />
              <YAxis stroke={C.axis} tick={{ fontSize: 10 }} domain={[0, 'auto']} />
              <Tooltip content={<PFTooltip />} />
              <ReferenceLine
                y={1}
                stroke="#f59e0b"
                strokeDasharray="4 4"
                label={{ value: 'break-even', fill: '#f59e0b', fontSize: 10, position: 'right' }}
              />
              <Line dataKey="pf" name="Profit Factor" stroke={C.equity} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* ── Calendar Heatmap ─────────────────────────────────────────────── */}
      <div>
        <div className="mb-3">
          <p className="text-sm font-semibold text-zinc-300">Activity Calendar</p>
          <p className="text-xs text-zinc-500">Last 13 weeks — daily P&L at a glance</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 overflow-x-auto">
          <div className="flex gap-1 min-w-max">
            {/* Day labels */}
            <div className="flex flex-col gap-1 mr-2 pt-5">
              {DOW_LABELS.map(d => (
                <div key={d} className="text-zinc-600 text-xs h-4 flex items-center w-7">{d}</div>
              ))}
            </div>
            {/* Week columns */}
            {calWeeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-1">
                {/* Month label on first day of month */}
                <div className="text-zinc-600 text-xs h-4 text-center" style={{ fontSize: 9 }}>
                  {week[0]?.date.slice(5, 7) === '01' || (wi === 0)
                    ? new Date(week[0]?.date).toLocaleString('en-US', { month: 'short' })
                    : week.some(d => d.date.slice(8) === '01')
                    ? new Date(week.find(d => d.date.slice(8) === '01')!.date).toLocaleString('en-US', { month: 'short' })
                    : ''}
                </div>
                {Array.from({ length: 7 }).map((_, di) => {
                  const day = week.find(d => d.dow === di)
                  return (
                    <div
                      key={di}
                      title={day
                        ? `${day.date}: ${day.pnl !== null ? fmt$(day.pnl) : 'no trades'}`
                        : ''
                      }
                      className="w-4 h-4 rounded-sm cursor-default"
                      style={{ backgroundColor: day ? calColor(day.pnl) : '#18181b' }}
                    />
                  )
                })}
              </div>
            ))}
          </div>
          {/* Legend */}
          <div className="flex items-center gap-2 mt-3 text-xs text-zinc-500">
            <span>Less</span>
            {([-600, -250, 0, 250, 600] as (number | null)[]).map((v, i) => (
              <div
                key={i}
                className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: calColor(v) }}
              />
            ))}
            <span>More</span>
            <span className="ml-4 text-zinc-600">Hover for details</span>
          </div>
        </div>
      </div>
    </div>
  )
}
