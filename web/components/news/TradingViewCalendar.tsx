'use client'

import { useEffect, useRef } from 'react'

const STORAGE_KEY = 'tv_calendar_prefs'
const DEFAULTS = { importanceFilter: '1', countryFilter: 'us' }

export default function TradingViewCalendar() {
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!container.current) return

    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    const prefs = { ...DEFAULTS, ...saved }

    const script = document.createElement('script')
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-events.js'
    script.async = true
    script.innerHTML = JSON.stringify({
      colorTheme: 'dark',
      isTransparent: true,
      width: '100%',
      height: '100%',
      locale: 'en',
      importanceFilter: prefs.importanceFilter,
      countryFilter: prefs.countryFilter,
    })

    // Listen for widget preference changes via postMessage
    const onMessage = (e: MessageEvent) => {
      if (e.data?.name === 'tv-widget-events' && e.data?.data) {
        const { importanceFilter, countryFilter } = e.data.data
        const update: Record<string, string> = {}
        if (importanceFilter) update.importanceFilter = importanceFilter
        if (countryFilter) update.countryFilter = countryFilter
        if (Object.keys(update).length > 0) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...prefs, ...update }))
        }
      }
    }

    window.addEventListener('message', onMessage)
    container.current.appendChild(script)

    return () => {
      window.removeEventListener('message', onMessage)
      if (container.current) container.current.innerHTML = ''
    }
  }, [])

  return (
    <div className="tradingview-widget-container h-full" ref={container}>
      <div className="tradingview-widget-container__widget h-full" />
    </div>
  )
}
