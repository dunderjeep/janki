'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
  smiles: string
  darkMode?: boolean
}

export function MolViewer2D({ smiles, darkMode = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!canvasRef.current || !smiles.trim()) return
    setError('')

    import('smiles-drawer').then((mod) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const SD: any = mod.default ?? mod
      const canvas = canvasRef.current!
      const w = canvas.parentElement?.clientWidth ?? 500
      const h = Math.round(w * 0.65)
      canvas.width  = w
      canvas.height = h

      const drawer = new SD.Drawer({
        width: w,
        height: h,
        bondThickness: 1.4,
        fontSizeLarge: 6,
        fontSizeSmall: 4.5,
        compactDrawing: false,
        explicitHydrogens: false,
      })

      SD.parse(
        smiles,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (tree: any) => { drawer.draw(tree, canvas, darkMode ? 'dark' : 'light', false) },
        (err: string) => { setError(`Cannot parse SMILES: ${err}`) },
      )
    }).catch(() => setError('Failed to load structure renderer'))
  }, [smiles, darkMode])

  if (error) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-red-500 px-4 text-center">
        {error}
      </div>
    )
  }

  return (
    <canvas
      ref={canvasRef}
      className="w-full"
      style={{ background: darkMode ? '#1f2937' : '#fff' }}
    />
  )
}
