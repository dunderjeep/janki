import type { ReactNode } from 'react'
import Link from 'next/link'

const TABS = [
  { href: '/banki', label: 'Overview' },
  { href: '/banki/ledger', label: 'General ledger' },
  { href: '/banki/journal', label: 'Journal' },
]

export default function BankiLayout({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4 mb-8">
        <Link href="/banki" className="text-2xl font-bold text-gray-900">
          <span className="text-green-600">$</span> Banki
        </Link>
        <nav className="flex gap-5 text-sm">
          {TABS.map((t) => (
            <Link key={t.href} href={t.href} className="text-gray-500 hover:text-green-700">
              {t.label}
            </Link>
          ))}
        </nav>
      </div>
      {children}
    </div>
  )
}
