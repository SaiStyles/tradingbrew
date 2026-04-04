'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'

interface Screenshot {
  id: string
  url: string
  created_at: string
}

interface TradeScreenshotsProps {
  tradeId: string
}

export default function TradeScreenshots({ tradeId }: TradeScreenshotsProps) {
  const [screenshots, setScreenshots] = useState<Screenshot[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const fetchScreenshots = useCallback(async () => {
    try {
      const res = await fetch(`/api/screenshots?trade_id=${tradeId}`)
      if (!res.ok) return
      const data = await res.json() as { screenshots: Screenshot[] }
      setScreenshots(data.screenshots)
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [tradeId])

  useEffect(() => { fetchScreenshots() }, [fetchScreenshots])

  // Keyboard navigation — only active when lightbox is open
  useEffect(() => {
    if (lightboxIndex === null) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        setLightboxIndex(i => i === null ? null : (i - 1 + screenshots.length) % screenshots.length)
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault()
        setLightboxIndex(i => i === null ? null : (i + 1) % screenshots.length)
      } else if (e.key === 'Escape') {
        setLightboxIndex(null)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [lightboxIndex, screenshots.length])

  const upload = async (file: File) => {
    if (uploading) return
    setUploadError(null)
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('trade_id', tradeId)
      const res = await fetch('/api/screenshots', { method: 'POST', body: form })
      const data = await res.json() as { screenshot?: Screenshot; error?: string }
      if (!res.ok) { setUploadError(data.error ?? 'Upload failed'); return }
      if (data.screenshot) setScreenshots(prev => [...prev, data.screenshot!])
    } catch {
      setUploadError('Upload failed — please try again')
    } finally {
      setUploading(false)
    }
  }

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploadError(null)
    const images = Array.from(files).filter(f => f.type.startsWith('image/'))
    if (images.length === 0) { setUploadError('Only image files are allowed'); return }
    const slotsLeft = 6 - screenshots.length
    const toUpload = images.slice(0, slotsLeft)
    if (images.length > slotsLeft) {
      setUploadError(`Only ${slotsLeft} slot${slotsLeft !== 1 ? 's' : ''} remaining — uploading first ${toUpload.length}`)
    }
    toUpload.reduce((chain, file) => chain.then(() => upload(file)), Promise.resolve())
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    handleFiles(e.dataTransfer.files)
  }, [tradeId, uploading]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true) }
  const handleDragLeave = () => setDragging(false)

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/screenshots/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setScreenshots(prev => {
          const next = prev.filter(s => s.id !== id)
          // Adjust lightbox index if needed
          setLightboxIndex(idx => {
            if (idx === null) return null
            const deletedIdx = prev.findIndex(s => s.id === id)
            if (next.length === 0) return null
            if (idx >= next.length) return next.length - 1
            if (idx > deletedIdx) return idx - 1
            return idx
          })
          return next
        })
      }
    } catch { /* silent */ }
  }

  const canUpload = screenshots.length < 6
  const activeLightbox = lightboxIndex !== null ? screenshots[lightboxIndex] : null

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
      <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-4">Charts</h2>

      {/* Loading skeleton */}
      {loading && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="aspect-video rounded-lg bg-zinc-800 animate-pulse" />
          <div className="aspect-video rounded-lg bg-zinc-800 animate-pulse" />
        </div>
      )}

      {/* Screenshot grid */}
      {!loading && screenshots.length > 0 && (
        <div className={`grid gap-3 mb-4 ${screenshots.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {screenshots.map((s, i) => (
            <div
              key={s.id}
              className="relative group rounded-lg overflow-hidden bg-zinc-800 aspect-video cursor-pointer"
              onClick={() => setLightboxIndex(i)}
            >
              <Image
                src={s.url}
                alt={`Chart ${i + 1}`}
                fill
                className="object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                sizes="(max-width: 768px) 100vw, 50vw"
              />
              {/* Index badge */}
              {screenshots.length > 1 && (
                <span className="absolute bottom-2 left-2 text-xs bg-black/60 text-white/70 px-1.5 py-0.5 rounded">
                  {i + 1}/{screenshots.length}
                </span>
              )}
              {/* Delete */}
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(s.id) }}
                className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/70 text-white/80 hover:text-white hover:bg-black/90 transition-all opacity-0 group-hover:opacity-100 flex items-center justify-center text-xs"
                aria-label="Remove screenshot"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Drop zone */}
      {canUpload && (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => !uploading && inputRef.current?.click()}
          className={`relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed transition-all cursor-pointer py-6 px-4
            ${dragging ? 'border-zinc-500 bg-zinc-800/60' : 'border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/30'}
            ${uploading ? 'pointer-events-none opacity-60' : ''}
          `}
        >
          {uploading ? (
            <>
              <div className="w-5 h-5 border-2 border-zinc-500 border-t-white rounded-full animate-spin" />
              <span className="text-xs text-zinc-500">Uploading…</span>
            </>
          ) : (
            <>
              <svg className="w-6 h-6 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 9.75h.008v.008H3V9.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM8.25 9V3.75a.75.75 0 01.75-.75h6a.75.75 0 01.75.75V9m-7.5 3h7.5" />
              </svg>
              <p className="text-xs text-zinc-500 text-center">
                {screenshots.length === 0 ? 'Drop chart screenshots here, or click to upload' : 'Add another chart'}
              </p>
              <p className="text-xs text-zinc-700">PNG, JPG, WEBP · max 5 MB · select multiple</p>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => { handleFiles(e.target.files); e.target.value = '' }}
          />
        </div>
      )}

      {screenshots.length >= 6 && (
        <p className="text-xs text-zinc-600 text-center mt-1">Maximum 6 screenshots reached</p>
      )}

      {uploadError && (
        <p className="text-xs text-red-400 mt-2 text-center">{uploadError}</p>
      )}

      {/* Lightbox */}
      {activeLightbox && lightboxIndex !== null && (
        <div
          className="fixed inset-0 bg-black/92 z-50 flex items-center justify-center"
          onClick={() => setLightboxIndex(null)}
        >
          {/* Close */}
          <button
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors z-10"
            onClick={() => setLightboxIndex(null)}
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Counter */}
          {screenshots.length > 1 && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 text-sm text-white/50 z-10">
              {lightboxIndex + 1} / {screenshots.length}
            </div>
          )}

          {/* Prev arrow */}
          {screenshots.length > 1 && (
            <button
              className="absolute left-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors z-10"
              onClick={(e) => { e.stopPropagation(); setLightboxIndex((lightboxIndex - 1 + screenshots.length) % screenshots.length) }}
              aria-label="Previous"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}

          {/* Image */}
          <div className="px-16 max-w-6xl w-full max-h-screen flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={activeLightbox.url}
              alt={`Chart ${lightboxIndex + 1}`}
              className="max-w-full max-h-[90vh] object-contain rounded-xl select-none"
            />
          </div>

          {/* Next arrow */}
          {screenshots.length > 1 && (
            <button
              className="absolute right-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors z-10"
              onClick={(e) => { e.stopPropagation(); setLightboxIndex((lightboxIndex + 1) % screenshots.length) }}
              aria-label="Next"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}

          {/* Dot indicators */}
          {screenshots.length > 1 && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
              {screenshots.map((_, i) => (
                <button
                  key={i}
                  onClick={(e) => { e.stopPropagation(); setLightboxIndex(i) }}
                  className={`w-1.5 h-1.5 rounded-full transition-all ${i === lightboxIndex ? 'bg-white scale-125' : 'bg-white/30 hover:bg-white/50'}`}
                  aria-label={`Go to chart ${i + 1}`}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
