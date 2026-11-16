import type { Metadata } from 'next'
import StandardModel from './StandardModel'

export const metadata: Metadata = { title: 'Standard Model' }

export default function StandardModelPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Standard Model</h1>
        <p className="text-gray-500 text-sm mt-1">
          The 17 fundamental particles that make up everything in the universe. Click any particle to explore.
        </p>
      </div>
      <StandardModel />
    </div>
  )
}
