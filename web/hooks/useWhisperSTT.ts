'use client'

import { useRef, useState, useCallback } from 'react'
import { SilenceDetector } from '@/lib/voice/silenceDetector'
import { getSupportedMimeType, mimeToExtension } from '@/lib/voice/getMimeType'

interface UseWhisperSTTOptions {
  onTranscript: (text: string) => void
  onSpeechStart?: () => void
  shouldSuppress?: () => boolean  // return true to skip sending to Whisper (e.g. while TTS plays)
  silenceThresholdDb?: number     // default -50
  silenceDurationMs?: number      // default 1500
}

export function useWhisperSTT({
  onTranscript,
  onSpeechStart,
  shouldSuppress,
  silenceThresholdDb = -50,
  silenceDurationMs = 1500,
}: UseWhisperSTTOptions) {
  const [isListening, setIsListening] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [soundDetected, setSoundDetected] = useState(false)

  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const detectorRef = useRef<SilenceDetector | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const mimeTypeRef = useRef<string>('')
  const isListeningRef = useRef(false)
  const hasSpeechRef = useRef(false)

  const sendChunkToWhisper = useCallback(async (chunks: Blob[], mimeType: string) => {
    if (chunks.length === 0) return
    if (shouldSuppress?.()) return

    const blob = new Blob(chunks, { type: mimeType || 'audio/webm' })

    // Skip tiny blobs — Whisper hallucinates on near-silence ("Thank you.", "You", etc.)
    if (blob.size < 3000) return

    setIsTranscribing(true)
    try {
      const form = new FormData()
      form.append('audio', blob, `audio.${mimeToExtension(mimeType)}`)
      form.append('mimeType', mimeType)

      // Do NOT set Content-Type header — browser sets it with boundary automatically
      const res = await fetch('/api/stt', { method: 'POST', body: form })
      if (!res.ok) {
        console.error('[stt] API error:', res.status)
        return
      }

      const data = await res.json() as { transcript?: string }
      const transcript = data.transcript?.trim()
      if (transcript && transcript.length > 0) {
        onTranscript(transcript)
      }
    } catch (e) {
      console.error('[stt] fetch error:', e)
    } finally {
      setIsTranscribing(false)
    }
  }, [onTranscript, shouldSuppress])

  const stopCurrentRecorder = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }
  }, [])

  const startNewRecorder = useCallback(() => {
    if (!streamRef.current) return

    const mimeType = mimeTypeRef.current
    let recorder: MediaRecorder
    try {
      recorder = new MediaRecorder(streamRef.current, mimeType ? { mimeType } : {})
    } catch {
      recorder = new MediaRecorder(streamRef.current)
    }

    chunksRef.current = []
    hasSpeechRef.current = false

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }

    recorder.onstop = () => {
      if (hasSpeechRef.current && isListeningRef.current) {
        sendChunkToWhisper([...chunksRef.current], mimeTypeRef.current)
      }
      chunksRef.current = []
      if (isListeningRef.current) {
        startNewRecorder()
      }
    }

    recorder.start()
    recorderRef.current = recorder
  }, [sendChunkToWhisper])

  const start = useCallback(async () => {
    if (isListeningRef.current) return

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      })

      streamRef.current = stream
      mimeTypeRef.current = getSupportedMimeType()

      const audioCtx = new AudioContext()
      audioCtxRef.current = audioCtx
      const source = audioCtx.createMediaStreamSource(stream)

      const detector = new SilenceDetector(audioCtx, source, {
        silenceThresholdDb,
        silenceDurationMs,
        onSpeechDetected: () => {
          setSoundDetected(true)
          hasSpeechRef.current = true
          onSpeechStart?.()
        },
        onSilenceDetected: () => {
          setSoundDetected(false)
          if (hasSpeechRef.current) {
            stopCurrentRecorder()
          }
        },
      })

      detectorRef.current = detector
      detector.start()

      isListeningRef.current = true
      setIsListening(true)

      startNewRecorder()
    } catch (e) {
      if (e instanceof DOMException && e.name === 'NotAllowedError') {
        alert('Microphone permission denied. Allow mic access in browser settings.')
      } else {
        console.error('[stt] getUserMedia error:', e)
      }
    }
  }, [silenceThresholdDb, silenceDurationMs, onSpeechStart, startNewRecorder, stopCurrentRecorder])

  const stop = useCallback(() => {
    isListeningRef.current = false
    setIsListening(false)
    setSoundDetected(false)

    detectorRef.current?.stop()
    detectorRef.current = null

    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }
    recorderRef.current = null

    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null

    audioCtxRef.current?.close()
    audioCtxRef.current = null
  }, [])

  return { isListening, isTranscribing, soundDetected, start, stop, stopCurrentRecorder }
}
