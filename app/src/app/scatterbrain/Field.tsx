'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * A text input that saves itself: shortly after typing stops, on blur, and when
 * it goes away. Give it a key per record so a pending edit lands on the record
 * it was typed for.
 */
export default function Field({ label, value, onSave, multiline, rows = 3, placeholder, className = '' }: {
  label: string
  value: string
  onSave: (value: string) => void
  multiline?: boolean
  rows?: number
  placeholder?: string
  className?: string
}) {
  const [text, setText] = useState(value)
  const latest = useRef(value)
  const saved = useRef(value)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const save = useRef(onSave)
  save.current = onSave

  const flush = () => {
    if (timer.current) clearTimeout(timer.current)
    if (latest.current !== saved.current) {
      saved.current = latest.current
      save.current(latest.current)
    }
  }

  useEffect(() => {
    if (value !== saved.current && latest.current === saved.current) {
      saved.current = value
      latest.current = value
      setText(value)
    }
  }, [value])

  useEffect(() => flush, [])

  const change = (next: string) => {
    setText(next)
    latest.current = next
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, 700)
  }

  const shared = {
    value: text,
    placeholder,
    onBlur: flush,
    className: 'mt-1 block w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm font-normal text-gray-900 focus:border-purple-400 focus:outline-none',
  }

  return (
    <label className={`block text-xs font-medium text-gray-600 ${className}`}>
      {label}
      {multiline
        ? <textarea {...shared} rows={rows} onChange={(e) => change(e.target.value)} />
        : <input {...shared} onChange={(e) => change(e.target.value)} />}
    </label>
  )
}
