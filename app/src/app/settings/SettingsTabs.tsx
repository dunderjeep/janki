'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/settings/accounts', label: 'Linked accounts' },
  { href: '/settings/phone', label: 'Phone access' },
]

export default function SettingsTabs() {
  const pathname = usePathname()
  return (
    <nav aria-label="Settings" className="max-w-xl mx-auto px-6 pt-8 flex gap-5 border-b border-gray-100">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={pathname === t.href ? 'page' : undefined}
          className={`pb-2 text-sm -mb-px border-b-2 ${
            pathname === t.href ? 'border-indigo-600 text-gray-900 font-medium' : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  )
}
