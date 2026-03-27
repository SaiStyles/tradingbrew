'use client'

import { useState, useEffect, useRef } from 'react'

type Message = {
  role: 'user' | 'buddy'
  content: string
  timestamp: Date
}

type SilentLogEntry = {
  action: string | null
  trade_data: { instrument?: string; pnl?: number } | null
}

export default function BuddyChat({ buddyName }: { buddyName: string }) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'buddy',
      content: `Hey! I'm ${buddyName}. I'm here with you during your session. How's the market looking today?`,
      timestamp: new Date()
    }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [interimText, setInterimText] = useState('')
  const [soundDetected, setSoundDetected] = useState(false)
  const [silentMode, setSilentMode] = useState(false)
  const [silentCount, setSilentCount] = useState(0)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<any>(null)
  const isListeningRef = useRef(false)
  const isSpeakingRef = useRef(false)
  const silentModeRef = useRef(false)
  const silentLogRef = useRef<SilentLogEntry[]>([])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Chrome bug: speechSynthesis pauses itself after page inactivity — force resume periodically
  useEffect(() => {
    const interval = setInterval(() => {
      if (typeof window !== 'undefined' && window.speechSynthesis?.paused) {
        window.speechSynthesis.resume()
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  const speak = (text: string) => {
    if (!('speechSynthesis' in window)) return

    // Chrome bug: cancel() + immediate speak() silently fails — small delay required
    window.speechSynthesis.cancel()

    setTimeout(() => {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 1.0
      utterance.pitch = 1.0
      utterance.volume = 1.0

      // Safety timeout: if onend never fires (Chrome stuck state), force reset after 30s
      const safetyTimer = setTimeout(() => {
        if (isSpeakingRef.current) {
          console.warn('[voice] speechSynthesis onend never fired — forcing reset')
          isSpeakingRef.current = false
          setIsSpeaking(false)
          if (isListeningRef.current) {
            startRecognition()
          }
        }
      }, 30000)

      utterance.onstart = () => {
        isSpeakingRef.current = true
        setIsSpeaking(true)
      }
      utterance.onend = () => {
        clearTimeout(safetyTimer)
        isSpeakingRef.current = false
        setIsSpeaking(false)
        if (isListeningRef.current) {
          setTimeout(() => {
            if (isListeningRef.current) {
              startRecognition()
            }
          }, 300)
        }
      }
      utterance.onerror = () => {
        clearTimeout(safetyTimer)
        isSpeakingRef.current = false
        setIsSpeaking(false)
      }

      window.speechSynthesis.speak(utterance)
    }, 100)
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
    speak(summary)
  }

  const toggleSilentMode = () => {
    if (!isListeningRef.current) return // silent mode only makes sense when mic is on
    const next = !silentModeRef.current
    silentModeRef.current = next
    setSilentMode(next)
    if (!next) surfaceSilentSummary()
  }

  const sendMessage = async (text: string) => {
    if (!text.trim()) return
    const isSilent = silentModeRef.current

    if (!isSilent) setLoading(true)
    setInterimText('')

    if (!isSilent) {
      const userMessage: Message = { role: 'user', content: text, timestamp: new Date() }
      setMessages(prev => [...prev, userMessage])
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
        const buddyMessage: Message = { role: 'buddy', content: data.reply, timestamp: new Date() }
        setMessages(prev => [...prev, buddyMessage])
        speak(data.reply)
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      if (!isSilent) setLoading(false)
    }
  }

  const startRecognition = () => {
    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition
    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    recognition.onsoundstart = () => { console.log('[voice] sound start'); setSoundDetected(true) }
    recognition.onsoundend = () => { console.log('[voice] sound end'); setSoundDetected(false) }
    recognition.onspeechstart = () => console.log('[voice] speech start')
    recognition.onspeechend = () => console.log('[voice] speech end')
    recognition.onaudiostart = () => console.log('[voice] audio start')

    recognition.onresult = (event: any) => {
      console.log('[voice] onresult fired', event.results)
      let interim = ''
      let final = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript
        if (event.results[i].isFinal) final += t
        else interim += t
      }
      if (interim && !silentModeRef.current) setInterimText(interim)
      if (final) {
        setInterimText('')
        sendMessage(final.trim())
      }
    }

    recognition.onerror = (event: any) => {
      if (event.error === 'no-speech' || event.error === 'network') return
      if (event.error === 'not-allowed') {
        alert('Microphone permission denied. Allow mic access in your browser settings.')
        isListeningRef.current = false
        setIsListening(false)
        return
      }
      console.error('Speech recognition error:', event.error)
      isListeningRef.current = false
      setIsListening(false)
    }

    recognition.onend = () => {
      setSoundDetected(false)
      if (isListeningRef.current && !isSpeakingRef.current) {
        // Fresh instance on restart — reusing the same instance is unreliable in Chrome
        setTimeout(() => {
          if (isListeningRef.current && !isSpeakingRef.current) {
            startRecognition()
          }
        }, 100)
      }
    }

    recognitionRef.current = recognition
    recognition.start()
  }

  const toggleListening = () => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      alert('Voice not supported in this browser. Use Chrome.')
      return
    }

    if (isListeningRef.current) {
      // If silent mode is on, surface summary before stopping
      if (silentModeRef.current) {
        silentModeRef.current = false
        setSilentMode(false)
        surfaceSilentSummary()
      }
      isListeningRef.current = false
      setIsListening(false)
      setInterimText('')
      setSoundDetected(false)
      recognitionRef.current?.stop()
      recognitionRef.current = null
      return
    }

    // Start directly — SpeechRecognition handles its own permission via onerror 'not-allowed'
    // Do NOT await getUserMedia first: the async gap breaks Chrome's user gesture chain
    // and startRecognition() silently fails
    isListeningRef.current = true
    setIsListening(true)
    startRecognition()
  }

  return (
    <div className="flex flex-col h-full bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full transition-colors ${
            silentMode ? 'bg-violet-500 animate-pulse' :
            soundDetected ? 'bg-yellow-400 animate-pulse' :
            isListening ? 'bg-green-400 animate-pulse' :
            'bg-zinc-600'
          }`} />
          <span className="text-white text-sm font-medium">{buddyName}</span>
          {isSpeaking && <span className="text-zinc-500 text-xs">speaking...</span>}
          {soundDetected && !silentMode && <span className="text-yellow-400 text-xs">hearing you...</span>}
          {silentMode && <span className="text-violet-400 text-xs">silent — still listening</span>}
        </div>
        <div className="flex items-center gap-2">
          {isListening && (
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
              isListening
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
            }`}
          >
            {isListening ? '🎤 Listening' : '🎤 Voice Off'}
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
        {interimText && !silentMode && (
          <div className="flex justify-end">
            <div className="max-w-[80%] rounded-2xl px-4 py-2 text-sm bg-blue-600/40 text-blue-200 rounded-br-sm italic">
              {interimText}
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
            onKeyDown={(e) => e.key === 'Enter' && sendMessage(input)}
            placeholder={silentMode ? 'Silent mode — speaking but not shown' : isListening ? 'Speak or type...' : 'Type or use voice...'}
            className="flex-1 bg-zinc-800 border border-zinc-700 text-white rounded-lg px-4 py-2.5 text-sm outline-none focus:border-blue-500 transition"
          />
          <button
            onClick={() => sendMessage(input)}
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
