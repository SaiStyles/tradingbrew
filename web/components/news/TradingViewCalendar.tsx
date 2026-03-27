'use client'

import { useEffect, useRef, useState } from 'react'

const STORAGE_KEY = 'tv_calendar_prefs'

const COUNTRIES = [
  { label: 'USA', value: 'us' },
  { label: 'EUR', value: 'eu' },
  { label: 'GBP', value: 'gb' },
  { label: 'JPY', value: 'jp' },
  { label: 'CAD', value: 'ca' },
  { label: 'AUD', value: 'au' },
]

const IMPACTS = [
  { label: 'High', value: '1' },
  { label: 'Med+', value: '0,1' },
  { label: 'All', value: '-1,0,1' },
]

function loadPrefs() {
  try {
    const s = localStorage.getItem(STORAGE_KEY)
    return s ? JSON.parse(s) : { country: 'us', importance: '1' }
  } catch {
    return { country: 'us', importance: '1' }
  }
}

function savePrefs(prefs: { country: string; importance: string }) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
}

function Widget({ country, importance }: { country: string; importance: string }) {
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!container.current) return
    container.current.innerHTML = ''

    const script = document.createElement('script')
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-events.js'
    script.async = true
    script.innerHTML = JSON.stringify({
      colorTheme: 'dark',
      isTransparent: true,
      width: '100%',
      height: '100%',
      locale: 'en',
      importanceFilter: importance,
      countryFilter: country,
    })

    container.current.appendChild(script)
  }, [country, importance])

  return (
    <div className="tradingview-widget-container h-full" ref={container}>
      <div className="tradingview-widget-container__widget h-full" />
    </div>
  )
}

export default function TradingViewCalendar() {
  const [prefs, setPrefs] = useState({ country: 'us', importance: '1' })
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setPrefs(loadPrefs())
    setMounted(true)
  }, [])

  function setCountry(value: string) {
    const next = { ...prefs, country: value }
    setPrefs(next)
    savePrefs(next)
  }

  function setImportance(value: string) {
    const next = { ...prefs, importance: value }
    setPrefs(next)
    savePrefs(next)
  }

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Our filter controls */}
      <div className="flex items-center gap-4">
        <div className="flex gap-1">
          {COUNTRIES.map(c => (
            <button
              key={c.value}
              onClick={() => setCountry(c.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                prefs.country === c.value
                  ? 'bg-violet-600 text-white'
                  : 'bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 ml-auto">
          {IMPACTS.map(i => (
            <button
              key={i.value}
              onClick={() => setImportance(i.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                prefs.importance === i.value
                  ? 'bg-zinc-700 text-white'
                  : 'bg-zinc-900 text-zinc-500 hover:text-white hover:bg-zinc-800'
              }`}
            >
              {i.label}
            </button>
          ))}
        </div>
      </div>

      {/* Widget — remounts when filters change */}
      <div className="flex-1 min-h-0">
        {mounted && <Widget country={prefs.country} importance={prefs.importance} />}
      </div>
    </div>
  )
}
