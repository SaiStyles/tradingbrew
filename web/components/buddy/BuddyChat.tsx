'use client'

import { useState, useEffect, useRef } from 'react'

type Message = {
  role: 'user' | 'buddy'
  content: string
  timestamp: Date
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
  const [interimText, setInterimText] = useState('')   // shows live transcript as you speak
  const [soundDetected, setSoundDetected] = useState(false) // lights up when mic hears audio
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<any>(null)
  const isListeningRef = useRef(false)
  const isSpeakingRef = useRef(false)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const speak = (text: string) => {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 1.0
    utterance.pitch = 1.0
    utterance.volume = 1.0
    utterance.onstart = () => {
      isSpeakingRef.current = true
      setIsSpeaking(true)
    }
    utterance.onend = () => {
      isSpeakingRef.current = false
      setIsSpeaking(false)
      // Chrome kills mic while speaking — restart after synthesis ends
      if (isListeningRef.current && recognitionRef.current) {
        setTimeout(() => {
          if (isListeningRef.current) {
            try { recognitionRef.current.start() } catch {}
          }
        }, 300)
      }
    }
    window.speechSynthesis.speak(utterance)
  }

  const sendMessage = async (text: string) => {
    if (!text.trim()) return
    setLoading(true)
    setInterimText('')

    const userMessage: Message = { role: 'user', content: text, timestamp: new Date() }
    setMessages(prev => [...prev, userMessage])
    setInput('')

    try {
      const res = await fetch('/api/buddy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      })
      const data = await res.json()
      const buddyMessage: Message = { role: 'buddy', content: data.reply, timestamp: new Date() }
      setMessages(prev => [...prev, buddyMessage])
      speak(data.reply)
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  const startRecognition = () => {
    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition
    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true   // show partial transcripts while speaking
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
      if (interim) setInterimText(interim)
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
        setTimeout(() => {
          if (isListeningRef.current && !isSpeakingRef.current) {
            try { recognition.start() } catch {}
          }
        }, 100)
      }
    }

    recognitionRef.current = recognition
    recognition.start()
  }

  const toggleListening = async () => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      alert('Voice not supported in this browser. Use Chrome.')
      return
    }

    if (isListeningRef.current) {
      isListeningRef.current = false
      setIsListening(false)
      setInterimText('')
      setSoundDetected(false)
      recognitionRef.current?.stop()
      recognitionRef.current = null
      return
    }

    // Request mic permission then immediately release — SpeechRecognition needs the mic free
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach(track => track.stop())
    } catch {
      alert('Microphone permission denied. Allow mic access in your browser settings.')
      return
    }

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
            soundDetected ? 'bg-yellow-400 animate-pulse' :
            isListening ? 'bg-green-400 animate-pulse' :
            'bg-zinc-600'
          }`} />
          <span className="text-white text-sm font-medium">{buddyName}</span>
          {isSpeaking && <span className="text-zinc-500 text-xs">speaking...</span>}
          {soundDetected && <span className="text-yellow-400 text-xs">hearing you...</span>}
        </div>
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
        {/* Live interim transcript bubble */}
        {interimText && (
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
            placeholder={isListening ? 'Speak or type...' : 'Type or use voice...'}
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
