import type { Status } from '../lib/types'

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
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-500'
export const primaryClass =
  'rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800 disabled:opacity-50 disabled:cursor-not-allowed'
export const secondaryClass =
  'rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:border-sky-500 hover:text-sky-800 disabled:opacity-50'

export const STATUS_PILL: Record<Status, string> = {
  saved: 'bg-gray-100 text-gray-700',
  applied: 'bg-sky-100 text-sky-800',
  interview: 'bg-violet-100 text-violet-800',
  offer: 'bg-green-100 text-green-800',
  rejected: 'bg-red-50 text-red-700',
  withdrawn: 'bg-stone-100 text-stone-600',
  parked: 'bg-amber-50 text-amber-800',
}

export const localToday = () => new Date().toLocaleDateString('sv-SE')

export function shortDate(value: string | null): string {
  if (!value) return '—'
  const date = value.length === 10 ? new Date(`${value}T12:00:00`) : new Date(value)
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function ago(value: string | null): string {
  if (!value) return 'never'
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return `${Math.round(hours / 24)} d ago`
}

export function daysUntil(date: string): number {
  return Math.round((new Date(`${date}T12:00:00`).getTime() - new Date(`${localToday()}T12:00:00`).getTime()) / 86_400_000)
}
