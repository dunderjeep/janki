'use client'

import { useEffect, useRef, useState, useId } from 'react'
import { Lightbox } from './Lightbox'

interface Props {
  syntax:    string
  className?: string
}

type RenderState = 'idle' | 'rendering' | 'ok' | 'error'

export function MermaidDiagram({ syntax, className = '' }: Props) {
  const containerId              = useId().replace(/:/g, '')
  const containerRef             = useRef<HTMLDivElement>(null)
  const [state, setState]        = useState<RenderState>('idle')
  const [errMsg, setErrMsg]      = useState('')
  const [showSource, setShowSrc] = useState(false)
  const [renderedSvg, setRenderedSvg] = useState('')
  const [lightboxOpen, setLightboxOpen] = useState(false)

  useEffect(() => {
    if (!syntax?.trim()) return
    let cancelled = false
    setState('rendering')
    setErrMsg('')

    ;(async () => {
      try {
        const mermaid = (await import('mermaid')).default

        mermaid.initialize({
          startOnLoad: false,
          theme:       'neutral',
          securityLevel: 'loose',
          fontFamily:  'var(--font-geist-sans, sans-serif)',
        })

        // parse() throws a ParseError on bad syntax; render() in v11 may return
        // an error SVG (bomb icon) without throwing, so we validate first.
        await mermaid.parse(syntax.trim())

        const id  = `mermaid-${containerId}`
        const { svg } = await mermaid.render(id, syntax.trim())

        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg
          const svgEl = containerRef.current.querySelector('svg')
          if (svgEl) {
            svgEl.removeAttribute('width')
            svgEl.removeAttribute('height')
            svgEl.style.maxWidth  = '100%'
            svgEl.style.height    = 'auto'
          }
          // Store for lightbox (after attribute cleanup)
          setRenderedSvg(containerRef.current.innerHTML)
          setState('ok')
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setErrMsg(e instanceof Error ? e.message : String(e))
          setState('error')
        }
      }
    })()

    return () => { cancelled = true }
  }, [syntax, containerId])

  return (
    <div className={`relative ${className}`}>

      {/* Rendered diagram — click to expand */}
      <div
        ref={containerRef}
        role={state === 'ok' ? 'button' : undefined}
        tabIndex={state === 'ok' ? 0 : undefined}
        title={state === 'ok' ? 'Click to expand' : undefined}
        onClick={() => state === 'ok' && setLightboxOpen(true)}
        onKeyDown={e => state === 'ok' && e.key === 'Enter' && setLightboxOpen(true)}
        className={`flex justify-center transition-opacity duration-200
                    ${state === 'ok' ? 'opacity-100 cursor-zoom-in hover:opacity-90' : 'opacity-0 h-0 overflow-hidden'}`}
      />

      {/* Loading */}
      {state === 'rendering' && (
        <div className="flex items-center justify-center py-6 text-xs text-gray-400 animate-pulse">
          Rendering diagram…
        </div>
      )}

      {/* Error */}
      {state === 'error' && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs">
          <p className="font-semibold text-red-600 mb-1">Diagram syntax error</p>
          <p className="text-red-500 font-mono text-[10px] leading-snug whitespace-pre-wrap break-all">
            {errMsg}
          </p>
          <button
            onClick={() => setShowSrc(v => !v)}
            className="mt-1.5 text-[10px] text-red-400 hover:text-red-600 underline"
          >
            {showSource ? 'Hide' : 'Show'} source
          </button>
          {showSource && (
            <pre className="mt-1 text-[9px] text-gray-600 bg-gray-50 rounded p-2 overflow-x-auto whitespace-pre-wrap">
              {syntax}
            </pre>
          )}
        </div>
      )}

      {/* Source toggle (on success) */}
      {state === 'ok' && (
        <div className="text-right mt-1">
          <button
            onClick={() => setShowSrc(v => !v)}
            className="text-[9px] text-gray-400 hover:text-gray-600 font-mono"
          >
            {showSource ? '▲ hide source' : '▼ source'}
          </button>
          {showSource && (
            <pre className="mt-1 text-left text-[9px] text-gray-500 bg-gray-50 rounded-lg p-2
                            overflow-x-auto whitespace-pre-wrap border border-gray-100">
              {syntax}
            </pre>
          )}
        </div>
      )}

      {/* Lightbox — full-screen diagram */}
      <Lightbox open={lightboxOpen} onClose={() => setLightboxOpen(false)}>
        <div
          className="w-full h-full [&>svg]:w-full [&>svg]:h-full [&>svg]:max-w-none"
          dangerouslySetInnerHTML={{ __html: renderedSvg }}
        />
      </Lightbox>
    </div>
  )
}
