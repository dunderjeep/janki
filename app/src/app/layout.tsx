import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Geist, Geist_Mono } from 'next/font/google'
import Link from 'next/link'
import Logo from '@/components/Logo'
import { JoblowskiNavIcon } from 'joblowski/ui'
import BinauralBeatsPlayer from '@/components/BinauralBeatsPlayer'
import BreathPractice from '@/components/BreathPractice'
import PomodoroTimer from '@/components/PomodoroTimer'
import Providers from '@/components/Providers'
import UserMenu from '@/components/UserMenu'
import { type DailyActivity } from '@/components/DailyDot'
import NavBar from '@/components/NavBar'
import './globals.css'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: { template: '%s | Janki', default: 'Janki' },
  description: 'Personal experimental workspace.',
  // Home-screen launch on iOS: full-screen, no Safari chrome.
  appleWebApp: { capable: true, title: 'janki', statusBarStyle: 'black' },
}

// ── Icon wrapper ─────────────────────────────────────────────────────────────
function Ico({ children }: { children: ReactNode }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none"
      viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
      strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  )
}

// ── Nav links with icons ─────────────────────────────────────────────────────
const NAV_LINKS: { href: string; label: string; icon: ReactNode; daily?: DailyActivity; counted?: boolean }[] = [
  {
    href: '/', label: 'Home',
    icon: <Ico>
      <path d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75" />
    </Ico>,
  },
  {
    // First after Home: this is the view that says what today is about, so it
    // should be the one your eye lands on before anything else in the bar.
    href: '/quilt/org', label: 'Focus',
    icon: <Ico>
      {/* bullseye — today at the centre, goals at the rim */}
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" />
    </Ico>,
  },
  {
    href: '/courses', label: 'Courses',
    icon: <Ico>
      {/* open book */}
      <path d="M2 4h9v16H2zM13 4h9v16h-9z" />
      <line x1="11" y1="4" x2="11" y2="20" />
    </Ico>,
  },
  {
    href: '/srs', label: 'SRS', daily: 'srs',
    icon: <Ico>
      {/* stacked cards */}
      <rect x="7" y="4" width="14" height="10" rx="1.5" />
      <rect x="3" y="8" width="14" height="10" rx="1.5" />
    </Ico>,
  },
  {
    href: '/quilt', label: 'Quilt',
    icon: <Ico>
      {/* knowledge graph nodes */}
      <circle cx="5" cy="6" r="2" />
      <circle cx="19" cy="6" r="2" />
      <circle cx="12" cy="18" r="2" />
      <line x1="5" y1="6" x2="19" y2="6" />
      <line x1="5" y1="6" x2="12" y2="18" />
      <line x1="19" y1="6" x2="12" y2="18" />
    </Ico>,
  },
  {
    href: '/banki', label: 'Banki',
    icon: <Ico>
      {/* dollar sign, scaled up about the centre so it fills the box */}
      <path
        transform="matrix(1.5 0 0 1.5 -6 -6)"
        vectorEffect="non-scaling-stroke"
        d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33"
      />
    </Ico>,
  },
  {
    href: '/bokki', label: 'Bokki',
    icon: <Ico>
      {/* receipt with a torn bottom edge */}
      <path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21z" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="9" y1="12" x2="15" y2="12" />
      <line x1="9" y1="16" x2="12" y2="16" />
    </Ico>,
  },
  {
    href: '/porcupin', label: 'Porcupin',
    icon: <Ico>
      {/* a porcupine's back, quills raised */}
      <path d="M3 19c0-5.5 4-9 9-9s9 3.5 9 9z" />
      <path d="M7 11.5L4.5 7M11 10l-1-5.5M15 10.5l2-5M18.5 13l3.5-3.5" />
    </Ico>,
  },
  {
    href: '/scatterbrain', label: 'Scatterbrain',
    icon: <Ico>
      {/* an open manuscript with loose pages */}
      <path d="M4 5.5C6.5 4 9.5 4 12 6c2.5-2 5.5-2 8-.5V19c-2.5-1.5-5.5-1.5-8 .5-2.5-2-5.5-2-8-.5z" />
      <line x1="12" y1="6" x2="12" y2="19.5" />
    </Ico>,
  },
  {
    href: '/joblowski', label: 'Joblowski',
    icon: <JoblowskiNavIcon />,
  },
  {
    href: '/nutrilabel', label: 'NutriLabel',
    icon: <Ico>
      {/* a Nutrition Facts table: title bar, thick rule, rows */}
      <rect x="5" y="3" width="14" height="18" rx="1" />
      <line x1="8" y1="7" x2="16" y2="7" />
      <line x1="8" y1="10" x2="16" y2="10" strokeWidth="2.5" />
      <line x1="8" y1="13.5" x2="16" y2="13.5" />
      <line x1="8" y1="17" x2="13" y2="17" />
    </Ico>,
  },
  {
    href: '/mail', label: 'Mail', counted: true,
    icon: <Ico>
      {/* an envelope */}
      <rect x="3" y="5.5" width="18" height="13" rx="1.5" />
      <path d="M3.5 6.5l8.5 6.5 8.5-6.5" />
    </Ico>,
  },
  {
    href: '/daily', label: 'Daily',
    icon: <Ico>
      {/* a page with today's lines on it */}
      <path d="M6 3h9l3 3v15H6z" />
      <line x1="9" y1="10" x2="15" y2="10" />
      <line x1="9" y1="14" x2="15" y2="14" />
      <line x1="9" y1="18" x2="13" y2="18" />
    </Ico>,
  },
  {
    href: '/next', label: 'Next',
    icon: <Ico>
      {/* a chain of steps, the first one lit */}
      <circle cx="5" cy="12" r="2.5" fill="currentColor" />
      <circle cx="12" cy="12" r="2.5" />
      <circle cx="19" cy="12" r="2.5" />
      <line x1="7.5" y1="12" x2="9.5" y2="12" />
      <line x1="14.5" y1="12" x2="16.5" y2="12" />
    </Ico>,
  },
  {
    href: '/dough', label: 'Dough',
    icon: <Ico>
      {/* a coin with a crown of fronts */}
      <circle cx="12" cy="14" r="6" />
      <path d="M12 11v6M10.5 12.5c0-1 3-1 3 0s-3 1-3 2 3 1 3 0" />
      <path d="M7 5l2 3M12 3v4M17 5l-2 3" />
    </Ico>,
  },
  {
    href: '/periodic-table', label: 'Periodic Table',
    icon: <Ico>
      {/* 2×2 element grid */}
      <rect x="2" y="2" width="8" height="8" rx="1" />
      <rect x="14" y="2" width="8" height="8" rx="1" />
      <rect x="2" y="14" width="8" height="8" rx="1" />
      <rect x="14" y="14" width="8" height="8" rx="1" />
    </Ico>,
  },
  {
    href: '/standard-model', label: 'Standard Model',
    icon: <Ico>
      {/* atom: nucleus + 3 orbits */}
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
      <ellipse cx="12" cy="12" rx="10" ry="3.5" />
      <ellipse cx="12" cy="12" rx="10" ry="3.5" transform="rotate(60 12 12)" />
      <ellipse cx="12" cy="12" rx="10" ry="3.5" transform="rotate(120 12 12)" />
    </Ico>,
  },
  {
    href: '/grapher', label: 'Grapher',
    icon: <Ico>
      {/* line chart */}
      <polyline points="3,19 7,12 11,15 15,7 19,10" />
      <line x1="3" y1="19" x2="21" y2="19" />
    </Ico>,
  },
  {
    href: '/chemistry', label: 'Chem Lab',
    icon: <Ico>
      {/* Erlenmeyer flask */}
      <path d="M9 3h6M9 3v5.5L5 17a2 2 0 001.83 2.5h10.34A2 2 0 0019 17l-4-8.5V3" />
      <line x1="6.5" y1="15" x2="17.5" y2="15" />
    </Ico>,
  },
  {
    href: '/electronics', label: 'Electronics',
    icon: <Ico>
      {/* CPU chip */}
      <rect x="7" y="7" width="10" height="10" rx="1" />
      <path d="M7 10H4M7 14H4M17 10h3M17 14h3M10 7V4M14 7V4M10 17v3M14 17v3" />
    </Ico>,
  },
  {
    href: '/radio', label: 'Radio Lab', daily: 'morse',
    icon: <Ico>
      {/* radio waves */}
      <path d="M5 12.55a11 11 0 0114.08 0" />
      <path d="M1.42 9a16 16 0 0121.16 0" />
      <path d="M8.53 16.11a6 6 0 016.95 0" />
      <circle cx="12" cy="20" r="1" fill="currentColor" stroke="none" />
    </Ico>,
  },
  {
    href: '/osi', label: 'OSI / CCNA',
    icon: <Ico>
      {/* layered stack */}
      <path d="M2 7l10-5 10 5-10 5z" />
      <path d="M2 12l10 5 10-5" />
      <path d="M2 17l10 5 10-5" />
    </Ico>,
  },
  {
    href: '/anatomy', label: 'Anatomy',
    icon: <Ico>
      {/* simple figure */}
      <circle cx="12" cy="5" r="2.5" />
      <path d="M12 7.5v7M9 11h6M10 21l2-6 2 6" />
    </Ico>,
  },
  {
    href: '/music', label: 'Piano & Voice Trainer',
    icon: <Ico>
      {/* piano keys */}
      <rect x="2" y="5" width="20" height="14" rx="1.5" />
      <line x1="7" y1="5" x2="7" y2="14" />
      <line x1="12" y1="5" x2="12" y2="14" />
      <line x1="17" y1="5" x2="17" y2="14" />
      <rect x="4.5" y="5" width="3" height="8" rx="0.5" fill="currentColor" stroke="none" />
      <rect x="9.5" y="5" width="3" height="8" rx="0.5" fill="currentColor" stroke="none" />
      <rect x="14.5" y="5" width="3" height="8" rx="0.5" fill="currentColor" stroke="none" />
    </Ico>,
  },
]

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="min-h-screen flex flex-col bg-white text-gray-900 antialiased">
        <Providers>

        {/* ── Navigation ─────────────────────────────────────────────────── */}
        <header className="border-b border-gray-200 bg-white sticky top-0 z-40">
          <div className="max-w-6xl mx-auto px-6 sm:h-14 flex flex-wrap sm:flex-nowrap items-center justify-between gap-x-3 gap-y-1 max-sm:py-2">
            <Link href="/" className="flex items-center gap-2 group shrink-0 max-sm:mr-auto">
              <Logo className="h-8 transition-opacity group-hover:opacity-80 max-sm:hidden" />
              <Logo iconOnly className="h-8 transition-opacity group-hover:opacity-80 sm:hidden" />
            </Link>

            <div className="flex items-center gap-3 min-w-0 max-sm:contents">
              {/* A row of its own on a phone, swiped sideways, so it cannot widen the page. */}
              <nav aria-label="Main navigation" className="min-w-0 overflow-x-auto max-sm:order-last max-sm:w-full">
                <NavBar items={NAV_LINKS} />
              </nav>
              <PomodoroTimer />
              <BreathPractice />
              <BinauralBeatsPlayer />
              <UserMenu />
            </div>
          </div>
        </header>

        {/* ── Page content ────────────────────────────────────────────────── */}
        <main className="flex-1">{children}</main>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <footer className="border-t border-gray-100 mt-16">
          <div className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-center gap-2">
            <Logo iconOnly className="h-4 opacity-40" />
            <span className="text-xs text-gray-400">personal workspace</span>
          </div>
        </footer>
        </Providers>
      </body>
    </html>
  )
}
