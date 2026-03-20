// Shared timezone helpers — never use server timezone, always use trader's tz

export function getISOOffset(timezone: string): string {
  const now = new Date()
  const tzStr = now.toLocaleString('en-US', { timeZone: timezone })
  const utcStr = now.toLocaleString('en-US', { timeZone: 'UTC' })
  const diffMs = new Date(tzStr).getTime() - new Date(utcStr).getTime()
  const diffMins = Math.round(diffMs / 60000)
  const sign = diffMins >= 0 ? '+' : '-'
  const abs = Math.abs(diffMins)
  const h = String(Math.floor(abs / 60)).padStart(2, '0')
  const m = String(abs % 60).padStart(2, '0')
  return `${sign}${h}:${m}`
}

export function getTodayInTz(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date()) // Returns YYYY-MM-DD
}

export function nowInTz(timezone: string): string {
  const offset = getISOOffset(timezone)
  const today = getTodayInTz(timezone)
  const localStr = new Date().toLocaleString('en-US', { timeZone: timezone, hour12: false })
  const d = new Date(localStr)
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${today}T${pad(d.getHours())}:${pad(d.getMinutes())}:00${offset}`
}
