'use client'

import { useEffect, useRef, useCallback } from 'react'

interface Props {
  sdf:     string | null
  loading: boolean
  style?:  '3dmol' | 'stick' | 'sphere' | 'surface'
}

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $3Dmol: any
    _3dmolLoaded: boolean
  }
}

function load3Dmol(): Promise<void> {
  if (window._3dmolLoaded) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://3dmol.org/build/3Dmol-min.js'
    s.async = true
    s.onload = () => { window._3dmolLoaded = true; resolve() }
    s.onerror = reject
    document.head.appendChild(s)
  })
}

export function MolViewer3D({ sdf, loading, style = '3dmol' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const viewerRef    = useRef<any>(null)

  const buildStyle = useCallback(() => {
    switch (style) {
      case 'stick':   return { stick: { colorscheme: 'Jmol', radius: 0.15 } }
      case 'sphere':  return { sphere: { colorscheme: 'Jmol', scale: 0.4 } }
      case 'surface': return { surface: { opacity: 0.7 }, stick: { colorscheme: 'Jmol', radius: 0.12 } }
      default:        return { stick: { colorscheme: 'Jmol', radius: 0.12 }, sphere: { colorscheme: 'Jmol', scale: 0.28 } }
    }
  }, [style])

  useEffect(() => {
    if (!sdf || !containerRef.current) return
    let cancelled = false

    load3Dmol().then(() => {
      if (cancelled || !containerRef.current) return
      const $3D = window.$3Dmol
      if (viewerRef.current) {
        try { viewerRef.current.clear() } catch { /* ignore */ }
      }
      const viewer = $3D.createViewer(containerRef.current, {
        backgroundColor: '#f9fafb',
        antialias: true,
        id: 'mol3d',
      })
      viewerRef.current = viewer
      viewer.addModel(sdf, 'sdf')
      viewer.setStyle({}, buildStyle())
      viewer.zoomTo()
      viewer.render()
    }).catch(console.error)

    return () => { cancelled = true }
  }, [sdf, buildStyle])

  // Re-apply style without re-loading model
  useEffect(() => {
    if (!viewerRef.current || !sdf) return
    viewerRef.current.setStyle({}, buildStyle())
    viewerRef.current.render()
  }, [style, buildStyle, sdf])

  return (
    <div className="relative w-full" style={{ height: 380 }}>
      <div ref={containerRef} className="absolute inset-0" />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50/80 rounded-xl">
          <span className="text-sm text-gray-400 animate-pulse">Loading 3D structure…</span>
        </div>
      )}
      {!sdf && !loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-300 gap-2">
          <span className="text-4xl">⬡</span>
          <p className="text-sm">No 3D data — try a named molecule</p>
        </div>
      )}
      {sdf && !loading && (
        <p className="absolute bottom-2 right-2 text-[10px] text-gray-300 pointer-events-none">
          Drag to rotate · Scroll to zoom · Right-drag to pan
        </p>
      )}
    </div>
  )
}
