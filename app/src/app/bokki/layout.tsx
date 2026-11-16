import type { ReactNode } from 'react'
import Link from 'next/link'
import { BUSINESS_NAME, LEGAL_NAME, ORG_NUMBER } from '@/lib/bokki/chart'

const TABS = [
  { href: '/bokki', label: 'Overview' },
  { href: '/bokki/ny', label: '+ New voucher' },
  { href: '/bokki/bilag', label: 'Vouchers (bilag)' },
]

export default function BokkiLayout({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4 mb-8">
        <Link href="/bokki" className="text-2xl font-bold text-gray-900">
          <span className="text-red-600">kr</span> Bokki{' '}
          {BUSINESS_NAME && <span className="text-base font-normal text-gray-400">· {BUSINESS_NAME}</span>}
          {(LEGAL_NAME || ORG_NUMBER) && (
            <span className="block text-xs font-normal text-gray-400">
              {[LEGAL_NAME, ORG_NUMBER && `org.nr ${ORG_NUMBER}`].filter(Boolean).join(' · ')}
            </span>
          )}
        </Link>
        <nav className="flex gap-5 text-sm">
          {TABS.map((t) => (
            <Link key={t.href} href={t.href} className="text-gray-500 hover:text-red-700">
              {t.label}
            </Link>
          ))}
        </nav>
      </div>
      {children}
    </div>
  )
}
