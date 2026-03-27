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

function loadPrefs() {
  try {
    const s = localStorage.getItem(STORAGE_KEY)
    return s ? JSON.parse(s) : { country: '' }
  } catch {
    return { country: '' }
  }
}

function savePrefs(prefs: { country: string }) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
}

function Widget({ country }: { country: string }) {
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
      importanceFilter: '1',
      ...(country ? { countryFilter: country } : {}),
    })

    container.current.appendChild(script)
  }, [country])

  return (
    <div className="tradingview-widget-container h-full" ref={container}>
      <div className="tradingview-widget-container__widget h-full" />
    </div>
  )
}

export default function TradingViewCalendar() {
  const [prefs, setPrefs] = useState({ country: '' })
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setPrefs(loadPrefs())
    setMounted(true)
  }, [])

  function setCountry(value: string) {
    const next = { country: prefs.country === value ? '' : value }
    setPrefs(next)
    savePrefs(next)
  }

  return (
    <div className="flex flex-col h-full gap-3">
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
      <div className="flex-1 min-h-0">
        {mounted && <Widget country={prefs.country} />}
      </div>
    </div>
  )
}
