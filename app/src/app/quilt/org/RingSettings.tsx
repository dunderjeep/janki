'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ringStyle, DEFAULT_RING_SETTINGS, BAND_MIN, BAND_MAX, PERIPHERY_RING,
  type RingSettings,
} from './orgGraph'

const KEY = 'quilt-org-rings'

/**
 * Read the stored ring geometry.
 *
 * Wrapped because a private window, cleared site data or a thumbnail capture
 * can make the accessor throw rather than return null. Anything malformed falls
 * back to the defaults rather than rendering a broken canvas.
 */
export function readRingSettings(): RingSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT_RING_SETTINGS
    const v = JSON.parse(raw) as Partial<RingSettings>
    const bands = Array.isArray(v.bands) && v.bands.length === PERIPHERY_RING + 1
      ? v.bands.map(n => Math.min(BAND_MAX, Math.max(BAND_MIN, Number(n) || 200)))
      : DEFAULT_RING_SETTINGS.bands
    return { bands, autoFit: v.autoFit !== false }
  } catch {
    return DEFAULT_RING_SETTINGS
  }
}

function store(s: RingSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // Not remembering the geometry is not worth failing over.
  }
}

/**
 * Ring geometry controls.
 *
 * Bands rather than radii: the rings nest, so setting an absolute radius on the
 * third ring means either overlapping the second or silently moving it. A band
 * is the width this horizon gets, and the rings stack outward from there — which
 * is also the way the question is actually asked ("give today more room").
 *
 * Changes are per-browser, so they live in localStorage. They move unplaced
 * notes, since those are positioned within their band; anything dragged by hand
 * keeps its coordinates and may then read as drifted.
 */
export default function RingSettingsPanel({
  settings, radii, counts, onChange,
}: {
  settings: RingSettings
  radii: number[]
  counts: number[]
  onChange: (s: RingSettings) => void
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    // Deferred: the click that opened the panel is still propagating.
    const t = setTimeout(() => window.addEventListener('mousedown', onDown), 0)
    return () => { clearTimeout(t); window.removeEventListener('mousedown', onDown) }
  }, [open])

  const setBand = useCallback((ring: number, value: number) => {
    const bands = [...settings.bands]
    bands[ring] = value
    const next = { ...settings, bands }
    onChange(next)
    store(next)
  }, [settings, onChange])

  const setAutoFit = useCallback((autoFit: boolean) => {
    const next = { ...settings, autoFit }
    onChange(next)
    store(next)
  }, [settings, onChange])

  const reset = useCallback(() => {
    onChange(DEFAULT_RING_SETTINGS)
    store(DEFAULT_RING_SETTINGS)
  }, [onChange])

  return (
    <div ref={box} className="absolute top-3 right-3 z-20">
      <button
        onClick={() => setOpen(o => !o)}
        title="Ring sizes"
        className={`w-8 h-8 rounded-full border bg-white/95 shadow-sm flex items-center
                    justify-center text-gray-500 hover:text-gray-800 ${
          open ? 'border-indigo-400 text-indigo-600' : 'border-gray-200'
        }`}
      >
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      {open && (
        <div className="mt-2 w-72 rounded-lg border border-gray-200 bg-white shadow-xl p-3 space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
              Ring sizes
            </span>
            <button onClick={reset} className="text-[10px] text-gray-400 hover:text-gray-700">
              Reset
            </button>
          </div>

          <p className="text-[10px] text-gray-400 leading-snug">
            Each slider is how wide that horizon&apos;s band is. Rings stack outward,
            so widening one pushes the rest out.
          </p>

          {Array.from({ length: PERIPHERY_RING + 1 }, (_, ring) => {
            const style = ringStyle(ring)
            const band = settings.bands[ring] ?? 200
            const grown = Math.round(radii[ring] - (ring === 0 ? 0 : radii[ring - 1]))
            return (
              <div key={ring}>
                <div className="flex items-baseline gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: style.dot }} />
                  <span className="text-[11px] text-gray-600 flex-1">{style.label}</span>
                  <span className="text-[9px] text-gray-400">{counts[ring] ?? 0} notes</span>
                  <span className="text-[10px] text-gray-500 tabular-nums w-14 text-right">
                    {grown}
                    {grown !== band && <span className="text-indigo-400" title="grown to fit"> ↑</span>}
                  </span>
                </div>
                <input
                  type="range"
                  min={BAND_MIN}
                  max={BAND_MAX}
                  step={20}
                  value={band}
                  onChange={e => setBand(ring, Number(e.target.value))}
                  className="w-full accent-indigo-600 h-1"
                />
              </div>
            )
          })}

          <label className="flex items-center gap-1.5 cursor-pointer pt-1 border-t border-gray-100">
            <input type="checkbox" checked={settings.autoFit}
              onChange={e => setAutoFit(e.target.checked)}
              className="accent-indigo-600 w-3 h-3" />
            <span className="text-[11px] text-gray-500">Grow a band if its notes won&apos;t fit</span>
          </label>

          <p className="text-[10px] text-gray-400 leading-snug">
            Moves unplaced notes. Anything you dragged keeps its spot, so it may
            start reading as drifted.
          </p>
        </div>
      )}
    </div>
  )
}
