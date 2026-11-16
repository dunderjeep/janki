'use client'

import dynamic from 'next/dynamic'
import type { FormulaResult, PlotMode } from '@/data/formulas'

const Plot = dynamic(() => import('react-plotly.js'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-gray-400 text-sm">
      Loading chart…
    </div>
  ),
})

interface PlotViewProps {
  result: FormulaResult
  mode: PlotMode
  title?: string
}

export default function PlotView({ result, mode, title }: PlotViewProps) {
  const { traces, xLabel, yLabel, zLabel } = result

  const baseLayout = {
    autosize: true,
    margin: { l: 55, r: 20, t: title ? 50 : 20, b: 55 },
    paper_bgcolor: 'white',
    plot_bgcolor: '#f9fafb',
    font: { size: 12, color: '#374151' },
    title: title ? { text: title, font: { size: 14, color: '#111827' } } : undefined,
    legend: { x: 1, xanchor: 'right', y: 1 },
    xaxis: { title: xLabel, gridcolor: '#e5e7eb', zerolinecolor: '#9ca3af' },
    yaxis: { title: yLabel, gridcolor: '#e5e7eb', zerolinecolor: '#9ca3af' },
  }

  const layout3d = {
    ...baseLayout,
    scene: {
      xaxis: { title: xLabel },
      yaxis: { title: yLabel },
      zaxis: { title: zLabel ?? 'z' },
      bgcolor: '#f9fafb',
    },
  }

  return (
    <Plot
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data={traces as any[]}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      layout={(mode === '3d' ? layout3d : baseLayout) as any}
      config={{ responsive: true, displayModeBar: true, displaylogo: false }}
      style={{ width: '100%', height: '100%' }}
      useResizeHandler
    />
  )
}
