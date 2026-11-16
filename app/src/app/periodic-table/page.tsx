import type { Metadata } from 'next'
import PeriodicTable from './PeriodicTable'

export const metadata: Metadata = { title: 'Periodic Table' }

export default function PeriodicTablePage() {
  return (
    <div className="max-w-[1400px] mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Periodic Table</h1>
        <p className="text-gray-500 text-sm mt-1">Click any element to explore its properties.</p>
      </div>
      <PeriodicTable />
    </div>
  )
}
