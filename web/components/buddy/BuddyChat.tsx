'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useWhisperSTT } from '@/hooks/useWhisperSTT'
import { createClient } from '@/lib/supabase/client'

// Split text into sentences so we can fire TTS requests in parallel
// and start playing sentence 1 while sentence 2 is still being fetched.
function splitSentences(text: string): string[] {
  // Split after .!? followed by whitespace + capital letter/digit/quote
  const parts = text.split(/(?<=[.!?])\s+(?=[A-Z"'\d])/)
  return parts.map(s => s.trim()).filter(s => s.length > 0)
}

// During streaming: extract complete sentences from a growing buffer.
// Returns complete sentences ready for TTS + the leftover incomplete fragment.
function extractCompleteSentences(text: string): { complete: string[]; remaining: string } {
  const parts = text.split(/(?<=[.!?])\s+(?=[A-Z"'\d])/)
  if (parts.length <= 1) return { complete: [], remaining: text }
  const complete = parts.slice(0, -1).map(s => s.trim()).filter(Boolean)
  const remaining = (parts[parts.length - 1] ?? '').trim()
  return { complete, remaining }
}

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
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [proactiveLoading, setProactiveLoading] = useState(true) // true until session opener resolves
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [silentMode, setSilentMode] = useState(false)
  const [silentCount, setSilentCount] = useState(0)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const isSpeakingRef = useRef(false)
  const silentModeRef = useRef(false)
  const openerFiredRef = useRef(false) // prevents re-firing when speak/buddyVoice refs change
  const speakRef = useRef<(text: string) => Promise<void>>(async () => {})
  const silentLogRef = useRef<SilentLogEntry[]>([])
  const audioCtxRef = useRef<AudioContext | null>(null)
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null)
  // Incremented every time speak() is called — older calls check this and exit early
  const speakGenRef = useRef(0)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Fetch a single TTS chunk — returns ArrayBuffer or null on failure
  const fetchTTSBuffer = useCallback(async (sentence: string): Promise<ArrayBuffer | null> => {
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: sentence, voice: buddyVoice || 'nova' }),
      })
      if (!res.ok) return null
      return await res.arrayBuffer()
    } catch {
      return null
    }
  }, [buddyVoice])

  // Play a single ArrayBuffer through the AudioContext — resolves when playback ends
  const playBuffer = useCallback((arrayBuffer: ArrayBuffer): Promise<void> =>
    new Promise((resolve) => {
      if (!isSpeakingRef.current) { resolve(); return }
      const run = async () => {
        try {
          if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
            audioCtxRef.current = new AudioContext()
          }
          if (audioCtxRef.current.state === 'suspended') {
            await audioCtxRef.current.resume()
          }
          const audioBuffer = await audioCtxRef.current.decodeAudioData(arrayBuffer)
          if (!isSpeakingRef.current) { resolve(); return }
          const source = audioCtxRef.current.createBufferSource()
          source.buffer = audioBuffer
          source.connect(audioCtxRef.current.destination)
          audioSourceRef.current = source
          source.onended = () => resolve()
          source.start()
        } catch { resolve() }
      }
      void run()
    })
  , [])

  // Sentence-chunked TTS: all fetches fire in parallel, audio plays in order.
  // Sentence 2 is usually ready before sentence 1 finishes — near-zero gap.
  // Generation counter prevents two concurrent speak() calls from fighting:
  // new call stops the old audio node (which resolves its playBuffer promise),
  // then the old call sees its gen is stale and exits.
  const speak = useCallback(async (text: string) => {
    const myGen = ++speakGenRef.current

    try { audioSourceRef.current?.stop() } catch { /* already stopped */ }

    isSpeakingRef.current = true
    setIsSpeaking(true)

    try {
      const sentences = splitSentences(text)
      // Fire all TTS requests immediately in parallel
      const bufferPromises = sentences.map(s => fetchTTSBuffer(s))

      for (const promise of bufferPromises) {
        if (!isSpeakingRef.current || speakGenRef.current !== myGen) break
        const buf = await promise
        if (!buf || !isSpeakingRef.current || speakGenRef.current !== myGen) break
        await playBuffer(buf)
      }
    } finally {
      // Only the most-recent call clears the speaking flag
      if (speakGenRef.current === myGen) {
        isSpeakingRef.current = false
        setIsSpeaking(false)
      }
    }
  }, [fetchTTSBuffer, playBuffer])

  // Streaming TTS: plays an ordered array of TTS fetch promises that grows live.
  // Starts as soon as the first sentence is ready — doesn't wait for full reply.
  // streamState.done = true signals that no more sentences will be added.
  const playStreamingSentences = useCallback(async (
    promises: Promise<ArrayBuffer | null>[],
    streamState: { done: boolean }
  ) => {
    const myGen = ++speakGenRef.current
    try { audioSourceRef.current?.stop() } catch { /* already stopped */ }
    isSpeakingRef.current = true
    setIsSpeaking(true)

    try {
      let i = 0
      while (true) {
        if (i < promises.length) {
          if (!isSpeakingRef.current || speakGenRef.current !== myGen) break
          const buf = await promises[i]
          if (!buf || !isSpeakingRef.current || speakGenRef.current !== myGen) break
          await playBuffer(buf)
          i++
        } else if (streamState.done) {
          break  // stream finished and all sentences played
        } else {
          // Stream still active — wait briefly for next sentence to arrive
          await new Promise(r => setTimeout(r, 50))
        }
      }
    } finally {
      if (speakGenRef.current === myGen) {
        isSpeakingRef.current = false
        setIsSpeaking(false)
      }
    }
  }, [playBuffer])

  // Keep speakRef current so the opener can call the latest speak without it being a dep
  useEffect(() => { speakRef.current = speak }, [speak])

  // Session opener: Buddy speaks first on mount — the Jarvis moment
  // Calls proactive API, which runs ProactiveGate + ProactiveBuddy and returns a personalised greeting.
  // Falls back to generic greeting if API returns null or errors.
  // openerFiredRef prevents re-firing when buddyVoice loads async and causes speak to change reference.
  useEffect(() => {
    if (openerFiredRef.current) return
    openerFiredRef.current = true

    let cancelled = false
    const fetchOpener = async () => {
      try {
        const res = await fetch('/api/buddy/proactive?trigger=session_start')
        const data = await res.json() as { message: string | null }
        if (cancelled) return

        const openerMessage = data.message ?? `Hey! I'm ${buddyName}. Here with you for the session. How's it looking today?`
        setMessages([{ role: 'buddy', content: openerMessage, timestamp: new Date() }])

        if (data.message) {
          void speakRef.current(data.message)
        }
      } catch {
        if (!cancelled) {
          setMessages([{ role: 'buddy', content: `Hey! I'm ${buddyName}. Here with you for the session. How's it looking today?`, timestamp: new Date() }])
        }
      } finally {
        if (!cancelled) setProactiveLoading(false)
      }
    }
    void fetchOpener()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Phase 2: Supabase Realtime — receives cron-triggered proactive messages (intervene, debrief, etc.)
  // Fires when the cron job inserts a row into proactive_queue for this user.
  // Gracefully no-ops if the table doesn't exist yet (before SQL migration is run).
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('proactive-push')
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'postgres_changes' as any,
        { event: 'INSERT', schema: 'public', table: 'proactive_queue' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          const row = payload?.new as { id: string; message: string; delivered: boolean } | null
          if (!row?.message || row.delivered) return
          setMessages(prev => [...prev, { role: 'buddy', content: row.message, timestamp: new Date() }])
          void speak(row.message)
          supabase
            .from('proactive_queue')
            .update({ delivered: true })
            .eq('id', row.id)
            .then(() => {})
        }
      )
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [speak])

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
      // Immediate TTS stop when Silero VAD detects real speech — not noise/keyboard
      if (isSpeakingRef.current) {
        try { audioSourceRef.current?.stop() } catch { /* already stopped */ }
        isSpeakingRef.current = false
        setIsSpeaking(false)
      }
    },
    shouldSuppress: () => isSpeakingRef.current,
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
        body: JSON.stringify({ message: text }),
      })

      if (!res.ok || !res.body) {
        console.error('[buddy] response error:', res.status)
        if (!isSilent) setLoading(false)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let fullReply = ''
      let msgAdded = false

      // Streaming TTS state — populated as sentences complete during streaming
      const ttsState = { done: false }
      const ttsPromises: Promise<ArrayBuffer | null>[] = []
      let ttsBuffer = ''   // text waiting for next sentence boundary
      let ttsStarted = false

      const flushBuffer = (done = false) => {
        const lines = buffer.split('\n')
        // Keep incomplete last line unless we're done
        buffer = done ? '' : (lines.pop() ?? '')

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (!raw) continue

          let event: Record<string, unknown>
          try { event = JSON.parse(raw) as Record<string, unknown> }
          catch { continue }

          if (event.type === 'token' && typeof event.text === 'string') {
            fullReply += event.text
            if (!isSilent) {
              if (!msgAdded) {
                // Add the placeholder buddy message
                setMessages(prev => [...prev, { role: 'buddy', content: fullReply, timestamp: new Date() }])
                msgAdded = true
              } else {
                // Update the last message in place
                setMessages(prev => {
                  const copy = [...prev]
                  copy[copy.length - 1] = { ...copy[copy.length - 1], content: fullReply }
                  return copy
                })
              }

              // TTS during streaming: fire fetch as each sentence completes
              ttsBuffer += event.text
              const { complete, remaining } = extractCompleteSentences(ttsBuffer)
              ttsBuffer = remaining
              for (const sentence of complete) {
                ttsPromises.push(fetchTTSBuffer(sentence))
                if (!ttsStarted) {
                  ttsStarted = true
                  void playStreamingSentences(ttsPromises, ttsState)
                }
              }
            }
          } else if (event.type === 'done') {
            if (isSilent) {
              silentLogRef.current.push({ action: (event.action as string | null) ?? null, trade_data: (event.trade_data as { instrument?: string; pnl?: number } | null) ?? null })
              setSilentCount(silentLogRef.current.length)
            } else {
              // Flush any remaining text that didn't end with sentence boundary
              if (ttsBuffer.trim()) {
                ttsPromises.push(fetchTTSBuffer(ttsBuffer))
                ttsBuffer = ''
              }
              ttsState.done = true
              // If no sentence boundary was ever hit (very short reply), start player now
              if (!ttsStarted && ttsPromises.length > 0) {
                void playStreamingSentences(ttsPromises, ttsState)
              }
            }
          } else if (event.type === 'error') {
            console.error('[buddy] stream error event:', event.message)
          }
        }
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) { flushBuffer(true); break }
        buffer += decoder.decode(value, { stream: true })
        flushBuffer()
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
