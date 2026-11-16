'use client'

import { useState } from 'react'
import { Lightbox } from './Lightbox'

interface Props {
  svg:       string
  className?: string
}

/** Strip script tags and inline event handlers from SVG before rendering. */
function sanitizeSvg(raw: string): string {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '')
}

/**
 * Renders an inline SVG string (Claude-generated or manually pasted).
 * Click to expand full-screen.
 */
export function SvgDisplay({ svg, className = '' }: Props) {
  const [open, setOpen] = useState(false)
  if (!svg?.trim()) return null
  const clean = sanitizeSvg(svg.trim())

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        title="Click to expand"
        onClick={() => setOpen(true)}
        onKeyDown={e => e.key === 'Enter' && setOpen(true)}
        className={`w-full max-w-full overflow-hidden cursor-zoom-in
                    [&>svg]:max-w-full [&>svg]:h-auto [&>svg]:w-full
                    hover:opacity-90 transition-opacity ${className}`}
        dangerouslySetInnerHTML={{ __html: clean }}
      />

      <Lightbox open={open} onClose={() => setOpen(false)}>
        <div
          className="w-full h-full [&>svg]:w-full [&>svg]:h-full [&>svg]:max-w-none"
          dangerouslySetInnerHTML={{ __html: clean }}
        />
      </Lightbox>
    </>
  )
}
