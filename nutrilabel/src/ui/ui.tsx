'use client'

import { useEffect, useState } from 'react'

export async function api<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error ?? `The request failed (${res.status})`)
  return json as T
}

export const message = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong')

export const inputClass =
  'w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-600'
export const primaryClass =
  'rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed'
export const secondaryClass =
  'rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:border-emerald-600 hover:text-emerald-800 disabled:opacity-50'
export const dangerClass =
  'rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-red-700 hover:border-red-500 disabled:opacity-50'
export const labelClass = 'block text-xs font-medium text-gray-500 mb-0.5'

/** A number input that lets you type "0." or "1,5" on the way to a number; blank is null. */
export function NumberField({ value, onChange, className, placeholder, title }: {
  value: number | null
  onChange: (v: number | null) => void
  className?: string
  placeholder?: string
  title?: string
}) {
  const [text, setText] = useState(value == null ? '' : String(value))
  useEffect(() => {
    const parsed = text.trim() === '' ? null : Number(text.replace(',', '.'))
    if (parsed !== value) setText(value == null ? '' : String(value))
    // Only follow the value when it changes from outside.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  const bad = text.trim() !== '' && !Number.isFinite(Number(text.replace(',', '.')))
  return (
    <input
      inputMode="decimal"
      title={title}
      placeholder={placeholder}
      className={`${className ?? inputClass} ${bad ? 'ring-2 ring-red-400' : ''}`}
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        const t = e.target.value.trim().replace(',', '.')
        if (t === '') onChange(null)
        else if (Number.isFinite(Number(t))) onChange(Number(t))
      }}
    />
  )
}

export function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className ?? ''}`}>
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  )
}

/** "12.3456" → "12.35", for the working, which shows more than the label does. */
export const show = (n: number | null | undefined, places = 2) => (n == null ? '–' : String(Number(n.toFixed(places))))
