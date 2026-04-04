'use client'

import { useState, useRef, useEffect } from 'react'

interface TradeVoiceNoteProps {
  tradeId: string
  initialUrl: string | null
}

type RecordingState = 'idle' | 'recording' | 'uploading'

export default function TradeVoiceNote({ tradeId, initialUrl }: TradeVoiceNoteProps) {
  const [url, setUrl] = useState<string | null>(initialUrl)
  const [state, setState] = useState<RecordingState>('idle')
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const startRecording = async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/ogg') ? 'audio/ogg'
        : 'audio/mp4'

      const recorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        streamRef.current?.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunksRef.current, { type: mimeType })
        await uploadAudio(blob, mimeType)
      }

      recorder.start()
      setState('recording')
      setRecordingSeconds(0)
      timerRef.current = setInterval(() => setRecordingSeconds(s => s + 1), 1000)
    } catch {
      setError('Microphone access denied')
    }
  }

  const stopRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    mediaRecorderRef.current?.stop()
    setState('uploading')
  }

  const uploadAudio = async (blob: Blob, mimeType: string) => {
    try {
      const ext = mimeType.includes('webm') ? 'webm' : mimeType.includes('ogg') ? 'ogg' : 'm4a'
      const file = new File([blob], `voice-note.${ext}`, { type: mimeType })
      const formData = new FormData()
      formData.append('file', file)
      formData.append('trade_id', tradeId)

      const res = await fetch('/api/voice-note', { method: 'POST', body: formData })
      if (!res.ok) {
        const body = await res.json() as { error?: string }
        throw new Error(body.error ?? 'Upload failed')
      }
      const { url: newUrl } = await res.json() as { url: string }
      setUrl(newUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setState('idle')
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    setError(null)
    try {
      const res = await fetch(`/api/voice-note?trade_id=${tradeId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      setUrl(null)
      setDeleteConfirm(false)
    } catch {
      setError('Failed to delete voice note')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
      <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-4">Voice Note</h2>

      {/* Existing recording */}
      {url && (
        <div className="mb-4">
          <audio controls src={url} className="w-full h-10 accent-blue-500" />
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-zinc-500">Tap to re-record and replace</span>
            {!deleteConfirm ? (
              <button
                onClick={() => setDeleteConfirm(true)}
                className="text-xs text-red-400 hover:text-red-300 transition-colors"
              >
                Delete
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400">Are you sure?</span>
                <button
                  onClick={() => setDeleteConfirm(false)}
                  className="text-xs text-zinc-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
                >
                  {deleting ? 'Deleting...' : 'Confirm'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recorder */}
      {state === 'idle' && (
        <button
          onClick={startRecording}
          className="flex items-center gap-2 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white text-sm rounded-lg transition-colors"
        >
          <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
          {url ? 'Record New' : 'Record Voice Note'}
        </button>
      )}

      {state === 'recording' && (
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-sm text-white font-mono">{formatTime(recordingSeconds)}</span>
            <span className="text-xs text-zinc-500">Recording...</span>
          </div>
          <button
            onClick={stopRecording}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg transition-colors"
          >
            Stop
          </button>
        </div>
      )}

      {state === 'uploading' && (
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Saving...
        </div>
      )}

      {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
    </div>
  )
}
