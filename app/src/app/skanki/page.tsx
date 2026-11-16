import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Skanki' }

// Placeholder: what Skanki becomes is still to be decided.
export default function SkankiPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-24 flex flex-col items-center text-center gap-4">
      <img src="/icons/janki.svg" alt="" className="w-28 h-28 rounded-[30px] shadow-lg" />
      <h1 className="text-3xl font-bold text-gray-900">Skanki</h1>
      <p className="text-gray-400">Coming soon.</p>
    </div>
  )
}
