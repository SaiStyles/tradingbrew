'use client'

import { useRef, useState, useCallback } from 'react'

// Encode Float32Array PCM (16kHz mono) from Silero VAD to WAV blob for Whisper
function encodeWav(samples: Float32Array, sampleRate = 16000): Blob {
  const dataLen = samples.length * 2  // 16-bit PCM
  const buffer = new ArrayBuffer(44 + dataLen)
  const view = new DataView(buffer)

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }

  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + dataLen, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)              // PCM chunk size
  view.setUint16(20, 1, true)               // PCM format
  view.setUint16(22, 1, true)               // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)  // byte rate
  view.setUint16(32, 2, true)               // block align
  view.setUint16(34, 16, true)              // bits per sample
  writeStr(36, 'data')
  view.setUint32(40, dataLen, true)

  let offset = 44
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
    offset += 2
  }

  return new Blob([buffer], { type: 'audio/wav' })
}

interface UseWhisperSTTOptions {
  onTranscript: (text: string) => void
  onSpeechStart?: () => void
  shouldSuppress?: () => boolean  // return true to skip sending to Whisper (e.g. while TTS plays)
}

export function useWhisperSTT({
  onTranscript,
  onSpeechStart,
  shouldSuppress,
}: UseWhisperSTTOptions) {
  const [isListening, setIsListening] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [soundDetected, setSoundDetected] = useState(false)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vadRef = useRef<any>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const isListeningRef = useRef(false)

  const sendToWhisper = useCallback(async (audio: Float32Array) => {
    if (shouldSuppress?.()) return

    const blob = encodeWav(audio)
    // Skip blobs that are too small — Whisper hallucinates on near-silence
    if (blob.size < 3000) return

    setIsTranscribing(true)
    try {
      const form = new FormData()
      form.append('audio', blob, 'audio.wav')
      form.append('mimeType', 'audio/wav')

      const res = await fetch('/api/stt', { method: 'POST', body: form })
      if (!res.ok) { console.error('[stt] API error:', res.status); return }

      const data = await res.json() as { transcript?: string }
      const transcript = data.transcript?.trim()
      if (transcript && transcript.length > 0) onTranscript(transcript)
    } catch (e) {
      console.error('[stt] fetch error:', e)
    } finally {
      setIsTranscribing(false)
    }
  }, [onTranscript, shouldSuppress])

  const start = useCallback(async () => {
    if (isListeningRef.current) return

    try {
      // Dynamic import — @ricky0123/vad-web is browser-only, must not run during SSR
      const { MicVAD } = await import('@ricky0123/vad-web')

      // Own the stream so we can control audio constraints (echo cancel, noise suppress)
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      })
      streamRef.current = stream

      const vad = await MicVAD.new({
        getStream: async () => stream,
        baseAssetPath: '/',
        onnxWASMBasePath: '/',
        onSpeechStart: () => {
          setSoundDetected(true)
          onSpeechStart?.()
        },
        onSpeechEnd: (audio: Float32Array) => {
          setSoundDetected(false)
          void sendToWhisper(audio)
        },
        onVADMisfire: () => {
          // Speech was too short — VAD decided it wasn't real speech
          setSoundDetected(false)
        },
        positiveSpeechThreshold: 0.5,
        negativeSpeechThreshold: 0.35,
        minSpeechMs: 250,      // discard anything shorter than 250ms — filters keyboard clicks, brief noise
        redemptionMs: 1000,    // wait 1000ms of silence before ending — balance between natural pauses and latency
        preSpeechPadMs: 150,   // 150ms padding before speech starts — avoids clipping the first word
      })

      vadRef.current = vad
      await vad.start()

      isListeningRef.current = true
      setIsListening(true)
    } catch (e) {
      if (e instanceof DOMException && e.name === 'NotAllowedError') {
        alert('Microphone permission denied. Allow mic access in browser settings.')
      } else {
        console.error('[stt] VAD init error:', e)
      }
    }
  }, [onSpeechStart, sendToWhisper])

  const stop = useCallback(() => {
    isListeningRef.current = false
    setIsListening(false)
    setSoundDetected(false)

    const cleanup = async () => {
      if (vadRef.current) {
        await vadRef.current.pause()
        await vadRef.current.destroy()
        vadRef.current = null
      }
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    void cleanup()
  }, [])

  return { isListening, isTranscribing, soundDetected, start, stop }
}
