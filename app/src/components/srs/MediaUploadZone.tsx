'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

export interface MediaValue {
  url:  string
  path: string   // MinIO key — needed for deletion
}

interface Props {
  label:    string
  accept:   'image' | 'audio'
  value:    MediaValue | null
  cardId:   string
  onChange: (v: MediaValue | null) => void
  /** @deprecated — zones now track their own hover state for paste routing */
  listenPaste?: boolean
}

const MIME_ACCEPT = { image: 'image/*', audio: 'audio/*' } as const

function fileMatchesAccept(file: File, accept: 'image' | 'audio'): boolean {
  return file.type.startsWith(accept + '/')
}

export function MediaUploadZone({
  label, accept, value, cardId, onChange,
}: Props) {
  const [dragging,  setDragging]  = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error,     setError]     = useState('')
  const [hovered,   setHovered]   = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // ── Upload helper ──────────────────────────────────────────────────────────

  const upload = useCallback(async (file: File) => {
    if (!fileMatchesAccept(file, accept)) {
      setError(`Expected ${accept} file`)
      return
    }
    setUploading(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('folder', `cards/${cardId}`)

      const res  = await fetch('/api/srs/media', { method: 'POST', body: fd })

      // A crashing route handler returns an empty body, so never assume JSON.
      const raw = await res.text()
      let data: { url?: string; key?: string; error?: string } = {}
      try { data = raw ? JSON.parse(raw) : {} } catch { /* non-JSON error page */ }

      if (!res.ok) throw new Error(data.error ?? `Upload failed (${res.status})`)
      if (!data.url || !data.key) throw new Error('Upload failed — malformed response')
      onChange({ url: data.url, path: data.key })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }, [accept, cardId, onChange])

  // ── Remove: delete from MinIO then clear local state ──────────────────────

  const remove = useCallback(async () => {
    if (!value) return
    onChange(null)
    fetch(`/api/srs/media?key=${encodeURIComponent(value.path)}`, { method: 'DELETE' })
      .catch(() => { /* ignore */ })
  }, [value, onChange])

  // ── Paste listener ────────────────────────────────────────────────────────
  // Each zone tracks its own hover state so paste is routed synchronously
  // without relying on parent state updates or async effect timing.

  useEffect(() => {
    if (!hovered || accept !== 'image') return
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of Array.from(items)) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) { upload(file); return }
        }
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [hovered, accept, upload])

  // ── Drag handlers ──────────────────────────────────────────────────────────

  const onDragOver  = (e: React.DragEvent) => { e.preventDefault(); setDragging(true) }
  const onDragLeave = ()                    => setDragging(false)
  const onDrop      = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) upload(file)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const isImage = accept === 'image'

  return (
    <div className="flex flex-col gap-1" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{label}</p>

      {value ? (
        /* ── Preview with remove button ── */
        <div className="relative rounded-xl border border-gray-200 bg-gray-50 p-2 group">
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={value.url}
              alt=""
              className="max-h-40 mx-auto rounded-lg object-contain block"
            />
          ) : (
            <audio controls src={value.url} className="w-full" />
          )}

          {/* Replace overlay shown on hover */}
          <div className="absolute inset-0 flex items-center justify-center gap-2
                          opacity-0 group-hover:opacity-100 transition-opacity
                          rounded-xl bg-black/30">
            <button
              onClick={() => inputRef.current?.click()}
              className="px-3 py-1.5 rounded-lg bg-white text-gray-800 text-xs font-semibold shadow"
            >
              Replace
            </button>
            <button
              onClick={remove}
              className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-semibold shadow"
            >
              Remove
            </button>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept={MIME_ACCEPT[accept]}
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) upload(f) }}
          />
        </div>
      ) : (
        /* ── Drop zone ── */
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => !uploading && inputRef.current?.click()}
          className={`cursor-pointer rounded-xl border-2 border-dashed p-4 text-center
                      transition-colors select-none ${
            dragging
              ? 'border-blue-400 bg-blue-50'
              : 'border-gray-200 hover:border-gray-400 bg-gray-50 hover:bg-gray-100'
          }`}
        >
          {uploading ? (
            <p className="text-xs text-blue-500 font-medium animate-pulse">Uploading…</p>
          ) : (
            <>
              <p className="text-lg mb-1">{isImage ? '🖼' : '🎵'}</p>
              <p className="text-xs text-gray-500 leading-snug">
                Drop, click or{isImage ? ' paste' : ' drop'}{' '}
                <span className="font-medium text-gray-700">
                  {isImage ? 'image' : 'audio'}
                </span>
              </p>
              <p className="text-[9px] text-gray-400 mt-0.5">
                {isImage ? 'PNG · JPG/JPEG · GIF · WebP' : 'MP3 · WAV · OGG · M4A'}
              </p>
            </>
          )}

          <input
            ref={inputRef}
            type="file"
            accept={MIME_ACCEPT[accept]}
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) upload(f) }}
          />
        </div>
      )}

      {error && <p className="text-[10px] text-red-500">{error}</p>}
    </div>
  )
}
