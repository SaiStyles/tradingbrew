'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useWhisperSTT } from '@/hooks/useWhisperSTT'

type Message = {
  role: 'user' | 'buddy'
  content: string
  timestamp: Date
}

type RecorderEntry = {
  text: string
  instrument?: string
  pnl?: number
  saved: boolean
}

type RecorderStatus = 'idle' | 'listening' | 'recording' | 'processing'

// Tape reel SVG — vintage audio recorder aesthetic
// Rings pulse on sound, slow spin on hub when active
function TapeReel({ isActive, soundDetected, isTranscribing, isProcessing }: {
  isActive: boolean
  soundDetected: boolean
  isTranscribing: boolean
  isProcessing: boolean
}) {
  const color = isProcessing ? '#3b82f6' : isActive ? '#22c55e' : '#3f3f46'
  const fillDim = isProcessing ? '#1e3a5f20' : isActive ? '#14532d20' : '#18181b'
  const holeFill = isProcessing ? '#1e3a8a' : isActive ? '#166534' : '#18181b'

  return (
    <div className="relative flex items-center justify-center">
      {/* Outer pulse rings — only when sound detected */}
      {(soundDetected || isProcessing) && (
        <>
          <div
            className="absolute rounded-full border animate-ping"
            style={{ width: 160, height: 160, borderColor: `${color}40` }}
          />
          <div
            className="absolute rounded-full border animate-ping"
            style={{ width: 180, height: 180, borderColor: `${color}20`, animationDelay: '200ms' }}
          />
        </>
      )}

      <svg width="140" height="140" viewBox="0 0 140 140" className="relative z-10">
        {/* Outermost decorative ring */}
        <circle cx="70" cy="70" r="67"
          fill="none"
          stroke={isActive ? `${color}30` : '#1c1c1e'}
          strokeWidth="1"
        />
        {/* Main reel body */}
        <circle cx="70" cy="70" r="60"
          fill={fillDim}
          stroke={color}
          strokeWidth="1.5"
          className={soundDetected ? 'animate-pulse' : ''}
        />
        {/* Spoke lines — like a real reel */}
        {[0, 60, 120, 180, 240, 300].map(deg => {
          const rad = deg * Math.PI / 180
          return (
            <line
              key={deg}
              x1={parseFloat((70 + 28 * Math.cos(rad)).toFixed(3))} y1={parseFloat((70 + 28 * Math.sin(rad)).toFixed(3))}
              x2={parseFloat((70 + 55 * Math.cos(rad)).toFixed(3))} y2={parseFloat((70 + 55 * Math.sin(rad)).toFixed(3))}
              stroke={isActive ? `${color}40` : '#27272a'}
              strokeWidth="1"
            />
          )
        })}
        {/* Inner hub */}
        <circle cx="70" cy="70" r="26"
          fill={isActive ? `${color}15` : '#27272a'}
          stroke={isActive ? `${color}80` : '#3f3f46'}
          strokeWidth="1.5"
        />
        {/* 3 reel holes at 120° intervals */}
        {[0, 120, 240].map(deg => {
          const rad = (deg - 90) * Math.PI / 180
          return (
            <circle
              key={deg}
              cx={parseFloat((70 + 14 * Math.cos(rad)).toFixed(3))}
              cy={parseFloat((70 + 14 * Math.sin(rad)).toFixed(3))}
              r="5"
              fill={holeFill}
              stroke={color}
              strokeWidth="1"
            />
          )
        })}
        {/* Center spindle */}
        <circle cx="70" cy="70" r="7" fill={color} />
        <circle cx="70" cy="70" r="3" fill={fillDim} />
      </svg>
    </div>
  )
}

export default function BuddyChat({ buddyName }: { buddyName: string }) {
  // ── Explorer state ──────────────────────────────────────
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [proactiveLoading, setProactiveLoading] = useState(true)

  // ── Recorder state ─────────────────────────────────────
  const [recorderEntries, setRecorderEntries] = useState<RecorderEntry[]>([])
  const [recorderStatus, setRecorderStatus] = useState<RecorderStatus>('idle')
  const [activeTab, setActiveTab] = useState<'recorder' | 'explorer'>('recorder')

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const openerFiredRef = useRef(false)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Session opener → set default greeting
  useEffect(() => {
    if (openerFiredRef.current) return
    openerFiredRef.current = true
    setMessages([{ role: 'buddy', content: `Hey! I'm ${buddyName}. Ask me anything about your trading.`, timestamp: new Date() }])
    setProactiveLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Recorder: voice → recorder pipeline (silent) ────────
  const handleRecorderTranscript = useCallback(async (text: string) => {
    setRecorderStatus('processing')
    try {
      const res = await fetch('/api/buddy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, mode: 'recorder' }),
      })
      if (!res.ok || !res.body) { setRecorderStatus('listening'); return }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done })
        const lines = buffer.split('\n')
        buffer = done ? '' : (lines.pop() ?? '')

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          let event: Record<string, unknown>
          try { event = JSON.parse(line.slice(6).trim()) as Record<string, unknown> }
          catch { continue }

          if (event.type === 'done') {
            const td = event.trade_data as { instrument?: string; pnl?: number } | null
            setRecorderEntries(prev => [
              {
                text,
                instrument: td?.instrument,
                pnl: td?.pnl,
                saved: event.action === 'save_trade',
              },
              ...prev,
            ].slice(0, 8))
          }
        }
        if (done) break
      }
    } catch { /* silent — recorder never shows errors */ }
    finally { setRecorderStatus('listening') }
  }, [])

  const stt = useWhisperSTT({
    onTranscript: handleRecorderTranscript,
    onSpeechStart: () => {
      if (recorderStatus === 'listening') setRecorderStatus('recording')
    },
  })

  const toggleRecorder = () => {
    if (stt.isListening) {
      stt.stop()
      setRecorderStatus('idle')
    } else {
      stt.start()
      setRecorderStatus('listening')
    }
  }

  // ── Explorer: text → chat pipeline ─────────────────────
  const sendExplorerMessage = async (text: string) => {
    if (!text.trim() || loading) return
    setLoading(true)
    setMessages(prev => [...prev, { role: 'user', content: text, timestamp: new Date() }])
    setInput('')

    try {
      const res = await fetch('/api/buddy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, mode: 'explorer' }),
      })
      if (!res.ok || !res.body) { setLoading(false); return }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let fullReply = ''
      let msgAdded = false

      while (true) {
        const { done, value } = await reader.read()
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done })
        const lines = buffer.split('\n')
        buffer = done ? '' : (lines.pop() ?? '')

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          let event: Record<string, unknown>
          try { event = JSON.parse(line.slice(6).trim()) as Record<string, unknown> }
          catch { continue }

          if (event.type === 'token' && typeof event.text === 'string') {
            fullReply += event.text
            if (!msgAdded) {
              setMessages(prev => [...prev, { role: 'buddy', content: fullReply, timestamp: new Date() }])
              msgAdded = true
            } else {
              setMessages(prev => {
                const copy = [...prev]
                copy[copy.length - 1] = { ...copy[copy.length - 1], content: fullReply }
                return copy
              })
            }
          }
        }
        if (done) break
      }
    } catch { /* handled */ }
    finally { setLoading(false) }
  }

  const isProcessing = recorderStatus === 'processing' || stt.isTranscribing

  // ── End Session ────────────────────────────────────────
  const [sessionSent, setSessionSent] = useState<'idle' | 'sending' | 'sent' | 'no_telegram'>('idle')

  const handleEndSession = useCallback(async () => {
    setSessionSent('sending')
    try {
      const res = await fetch('/api/telegram/summary', { method: 'POST' })
      if (!res.ok) { setSessionSent('idle'); return }
      const data = await res.json() as { sent: boolean; reason?: string }
      setSessionSent(data.sent ? 'sent' : 'no_telegram')
      if (data.sent) setTimeout(() => setSessionSent('idle'), 4000)
    } catch {
      setSessionSent('idle')
    }
  }, [])

  return (
    <div className="flex flex-col h-full bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">

      {/* ── Toggle ─────────────────────────────────────────── */}
      <div className="flex items-center gap-1 p-2 border-b border-zinc-800 flex-shrink-0">
        <button
          onClick={() => setActiveTab('recorder')}
          className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'recorder'
              ? 'bg-zinc-700 text-white'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          Recorder
        </button>
        <button
          onClick={() => setActiveTab('explorer')}
          className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'explorer'
              ? 'bg-zinc-700 text-white'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          Analyst
        </button>
      </div>

      {/* ── RECORDER ─────────────────────────────────────── */}
      <div className={`flex flex-col flex-1 overflow-hidden ${activeTab !== 'recorder' ? 'hidden' : ''}`}>
      <div className="p-6 flex-1 overflow-y-auto">

        <div className="flex flex-col items-center gap-5">
          {/* Tape reel — clickable */}
          <button onClick={toggleRecorder} className="focus:outline-none" aria-label="Toggle recording">
            <TapeReel
              isActive={stt.isListening}
              soundDetected={stt.soundDetected}
              isTranscribing={stt.isTranscribing}
              isProcessing={isProcessing}
            />
          </button>

          {/* Status */}
          <div className="text-center space-y-1">
            <p className="text-sm">
              {recorderStatus === 'idle' && <span className="text-zinc-500">Click to start</span>}
              {recorderStatus === 'listening' && <span className="text-green-400">Listening</span>}
              {recorderStatus === 'recording' && <span className="text-yellow-400 animate-pulse">Recording...</span>}
              {recorderStatus === 'processing' && <span className="text-blue-400">Processing...</span>}
              {stt.isTranscribing && recorderStatus !== 'processing' && <span className="text-blue-400">Transcribing...</span>}
            </p>
            <p className="text-xs text-zinc-600">Speak your trades naturally. Everything is handled silently.</p>
          </div>
        </div>

        {/* Recent captures */}
        {recorderEntries.length > 0 && (
          <div className="mt-6 space-y-1.5">
            {recorderEntries.map((entry, i) => (
              <div key={i} className={`flex items-center justify-between text-xs rounded-lg px-3 py-2 ${
                i === 0 ? 'bg-zinc-800' : 'bg-zinc-800/50'
              }`}>
                <span className="text-zinc-400 truncate max-w-[65%]">{entry.text}</span>
                <span className={entry.saved ? 'text-green-400 font-medium' : 'text-zinc-600'}>
                  {entry.saved
                    ? `✓ ${[entry.instrument, entry.pnl != null ? `$${entry.pnl}` : null].filter(Boolean).join(' ') || 'saved'}`
                    : 'heard'
                  }
                </span>
              </div>
            ))}

            {/* End Session */}
            <div className="pt-3 flex flex-col items-center gap-1">
              {sessionSent === 'sent' ? (
                <p className="text-green-400 text-xs">Summary sent to Telegram</p>
              ) : sessionSent === 'no_telegram' ? (
                <p className="text-zinc-500 text-xs">Connect Telegram in Settings to receive summaries</p>
              ) : (
                <button
                  onClick={() => void handleEndSession()}
                  disabled={sessionSent === 'sending'}
                  className="text-xs text-zinc-500 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-lg px-4 py-1.5 transition-colors disabled:opacity-50"
                >
                  {sessionSent === 'sending' ? 'Sending...' : 'End Session'}
                </button>
              )}
            </div>
          </div>
        )}
        </div>
      </div>

      {/* ── EXPLORER MODE ────────────────────────────────── */}
      <div className={`flex flex-col flex-1 overflow-hidden ${activeTab !== 'explorer' ? 'hidden' : ''}`}>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-sm'
                  : 'bg-zinc-800 text-zinc-100 rounded-bl-sm'
              }`}>
                {msg.content}
              </div>
            </div>
          ))}
          {(loading || proactiveLoading) && (
            <div className="flex justify-start">
              <div className="bg-zinc-800 rounded-2xl rounded-bl-sm px-4 py-2">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-zinc-800 flex-shrink-0">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void sendExplorerMessage(input)}
              placeholder="How do I perform on Mondays? What's my biggest weakness?"
              className="flex-1 bg-zinc-800 border border-zinc-700 text-white rounded-lg px-4 py-2.5 text-sm outline-none focus:border-blue-500 transition placeholder:text-zinc-600"
            />
            <button
              onClick={() => void sendExplorerMessage(input)}
              disabled={loading || !input.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg px-4 py-2.5 text-sm transition"
            >
              Ask
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
