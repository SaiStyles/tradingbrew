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
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<any>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Speak buddy response
  const speak = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 1.0
      utterance.pitch = 1.0
      utterance.volume = 1.0
      utterance.onstart = () => setIsSpeaking(true)
      utterance.onend = () => setIsSpeaking(false)
      window.speechSynthesis.speak(utterance)
    }
  }

  // Send message to buddy
  const sendMessage = async (text: string) => {
    if (!text.trim()) return
    setLoading(true)

    const userMessage: Message = {
      role: 'user',
      content: text,
      timestamp: new Date()
    }
    setMessages(prev => [...prev, userMessage])
    setInput('')

    try {
      const res = await fetch('/api/buddy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      })
      const data = await res.json()

      const buddyMessage: Message = {
        role: 'buddy',
        content: data.reply,
        timestamp: new Date()
      }
      setMessages(prev => [...prev, buddyMessage])
      speak(data.reply)
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  // Toggle voice listening
  const toggleListening = () => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      alert('Voice not supported in this browser. Use Chrome.')
      return
    }

    if (isListening) {
      recognitionRef.current?.stop()
      setIsListening(false)
      return
    }

    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition
    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = false
    recognition.lang = 'en-US'

    recognition.onresult = (event: any) => {
      const transcript = event.results[event.results.length - 1][0].transcript
      sendMessage(transcript)
    }

    recognition.onerror = () => {
      setIsListening(false)
    }

    recognition.onend = () => {
      if (isListening) recognition.start()
    }

    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
  }

  return (
    <div className="flex flex-col h-full bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isListening ? 'bg-green-400 animate-pulse' : 'bg-zinc-600'}`} />
          <span className="text-white text-sm font-medium">{buddyName}</span>
          {isSpeaking && <span className="text-zinc-500 text-xs">speaking...</span>}
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
            placeholder={isListening ? 'Listening...' : 'Type or use voice...'}
            disabled={isListening}
            className="flex-1 bg-zinc-800 border border-zinc-700 text-white rounded-lg px-4 py-2.5 text-sm outline-none focus:border-blue-500 transition disabled:opacity-50"
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