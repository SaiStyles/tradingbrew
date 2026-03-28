'use client'

import { useState, useEffect, useRef } from 'react'
import { useWhisperSTT } from '@/hooks/useWhisperSTT'

type Message = {
  role: 'user' | 'buddy'
  content: string
  timestamp: Date
}

type SilentLogEntry = {
  action: string | null
  trade_data: { instrument?: string; pnl?: number } | null
}

export default function BuddyChat({ buddyName, buddyVoice }: { buddyName: string; buddyVoice?: string }) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'buddy',
      content: `Hey! I'm ${buddyName}. I'm here with you during your session. How's the market looking today?`,
      timestamp: new Date()
    }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [silentMode, setSilentMode] = useState(false)
  const [silentCount, setSilentCount] = useState(0)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const isSpeakingRef = useRef(false)
  const silentModeRef = useRef(false)
  const silentLogRef = useRef<SilentLogEntry[]>([])
  const audioCtxRef = useRef<AudioContext | null>(null)
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const speak = async (text: string) => {
    try { audioSourceRef.current?.stop() } catch { /* already stopped */ }

    isSpeakingRef.current = true
    setIsSpeaking(true)

    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: buddyVoice || 'nova' }),
      })
      if (!res.ok) throw new Error(`TTS ${res.status}`)

      const arrayBuffer = await res.arrayBuffer()

      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new AudioContext()
      }
      if (audioCtxRef.current.state === 'suspended') {
        await audioCtxRef.current.resume()
      }

      const audioBuffer = await audioCtxRef.current.decodeAudioData(arrayBuffer)
      const source = audioCtxRef.current.createBufferSource()
      source.buffer = audioBuffer
      source.connect(audioCtxRef.current.destination)
      audioSourceRef.current = source

      source.onended = () => {
        isSpeakingRef.current = false
        setIsSpeaking(false)
      }

      source.start()
    } catch (e) {
      console.error('[tts] failed:', e)
      isSpeakingRef.current = false
      setIsSpeaking(false)
    }
  }

  const surfaceSilentSummary = () => {
    const log = silentLogRef.current
    silentLogRef.current = []
    setSilentCount(0)
    if (log.length === 0) return

    const saved = log.filter(e => e.action === 'save_trade').length
    const flagged = log.filter(e => e.action !== null && e.action !== 'save_trade').length

    let summary = `Back. Logged ${saved} trade${saved !== 1 ? 's' : ''} across ${log.length} message${log.length !== 1 ? 's' : ''}`
    if (flagged > 0) summary += `, ${flagged} flagged`
    else summary += ', nothing flagged'
    summary += '.'

    setMessages(prev => [...prev, { role: 'buddy', content: summary, timestamp: new Date() }])
    void speak(summary)
  }

  const stt = useWhisperSTT({
    onTranscript: (text) => {
      // Interruption: user speaks while Buddy is talking — stop TTS, process speech
      if (isSpeakingRef.current) {
        try { audioSourceRef.current?.stop() } catch { /* already stopped */ }
        isSpeakingRef.current = false
        setIsSpeaking(false)
      }
      void sendMessage(text)
    },
    onSpeechStart: () => {
      // Immediate TTS stop on first sound — feels responsive
      if (isSpeakingRef.current) {
        try { audioSourceRef.current?.stop() } catch { /* already stopped */ }
        isSpeakingRef.current = false
        setIsSpeaking(false)
      }
    },
    shouldSuppress: () => isSpeakingRef.current,
    silenceDurationMs: 1200,
    silenceThresholdDb: -45,  // -45 is more permissive than -50 for typical mics
  })

  const toggleSilentMode = () => {
    if (!stt.isListening) return
    const next = !silentModeRef.current
    silentModeRef.current = next
    setSilentMode(next)
    if (!next) surfaceSilentSummary()
  }

  const sendMessage = async (text: string) => {
    if (!text.trim()) return
    const isSilent = silentModeRef.current

    if (!isSilent) setLoading(true)

    if (!isSilent) {
      setMessages(prev => [...prev, { role: 'user', content: text, timestamp: new Date() }])
    }
    setInput('')

    try {
      const res = await fetch('/api/buddy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      })
      const data = await res.json()

      if (isSilent) {
        silentLogRef.current.push({ action: data.action ?? null, trade_data: data.trade_data ?? null })
        setSilentCount(silentLogRef.current.length)
      } else {
        setMessages(prev => [...prev, { role: 'buddy', content: data.reply, timestamp: new Date() }])
        void speak(data.reply)
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      if (!isSilent) setLoading(false)
    }
  }

  const toggleListening = () => {
    if (stt.isListening) {
      if (silentModeRef.current) {
        silentModeRef.current = false
        setSilentMode(false)
        surfaceSilentSummary()
      }
      stt.stop()
    } else {
      stt.start()
    }
  }

  return (
    <div className="flex flex-col h-full bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full transition-colors ${
            silentMode ? 'bg-violet-500 animate-pulse' :
            stt.soundDetected ? 'bg-yellow-400 animate-pulse' :
            stt.isListening ? 'bg-green-400 animate-pulse' :
            'bg-zinc-600'
          }`} />
          <span className="text-white text-sm font-medium">{buddyName}</span>
          {isSpeaking && <span className="text-zinc-500 text-xs">speaking...</span>}
          {stt.isTranscribing && <span className="text-blue-400 text-xs">thinking...</span>}
          {stt.soundDetected && !silentMode && <span className="text-yellow-400 text-xs">hearing you...</span>}
          {silentMode && <span className="text-violet-400 text-xs">silent — still listening</span>}
        </div>
        <div className="flex items-center gap-2">
          {stt.isListening && (
            <button
              onClick={toggleSilentMode}
              className={`text-xs px-3 py-1 rounded-full transition ${
                silentMode
                  ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
                  : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:text-white'
              }`}
            >
              {silentMode ? `Silent (${silentCount})` : 'Silent'}
            </button>
          )}
          <button
            onClick={toggleListening}
            className={`text-xs px-3 py-1 rounded-full transition ${
              stt.isListening
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
            }`}
          >
            {stt.isListening ? '🎤 Listening' : '🎤 Voice Off'}
          </button>
        </div>
      </div>

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
        {/* Recording indicator — shows while mic detects sound */}
        {stt.soundDetected && !silentMode && (
          <div className="flex justify-end">
            <div className="max-w-[80%] rounded-2xl px-4 py-2 text-sm bg-blue-600/30 text-blue-300 rounded-br-sm italic flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
              recording...
            </div>
          </div>
        )}
        {/* Transcribing indicator — shows while Whisper processes */}
        {stt.isTranscribing && !silentMode && (
          <div className="flex justify-end">
            <div className="max-w-[80%] rounded-2xl px-4 py-2 text-sm bg-zinc-700/50 text-zinc-400 rounded-br-sm italic">
              transcribing...
            </div>
          </div>
        )}
        {loading && (
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
      <div className="p-4 border-t border-zinc-800">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void sendMessage(input)}
            placeholder={silentMode ? 'Silent mode — speaking but not shown' : stt.isListening ? 'Speak or type...' : 'Type or use voice...'}
            className="flex-1 bg-zinc-800 border border-zinc-700 text-white rounded-lg px-4 py-2.5 text-sm outline-none focus:border-blue-500 transition"
          />
          <button
            onClick={() => void sendMessage(input)}
            disabled={loading || !input.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg px-4 py-2.5 text-sm transition"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
