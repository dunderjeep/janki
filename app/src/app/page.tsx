import type { Metadata } from 'next'
import AppGrid, { type AppTile } from '@/components/AppGrid'
import { auth } from '@/auth'
import { imageSrc } from '@/lib/porcupin/types'
import { currentWork } from '@/lib/scatterbrain/store'

export const metadata: Metadata = { title: 'Home' }

/** "Business books · Your Co" when BOKKI_BUSINESS_NAME is set in .env.local. */
function withBusiness(what: string): string {
  const name = process.env.BOKKI_BUSINESS_NAME
  return name ? `${what} · ${name}` : what
}

const APPS: AppTile[] = [
  {
    href: '/quilt/org',
    title: 'Focus',
    subtitle: 'Notes, by horizon',
    description:
      'Your notes in rings around today — this week, this month, this year, goals, periphery. Drag to place and it stays placed. Double-click opens the note.',
    glyph: '🎯',
    tile: 'from-amber-300 to-orange-500',
  },
  {
    href: '/srs',
    title: 'SRS',
    subtitle: 'Spaced repetition',
    description:
      'Study flashcard decks with FSRS-4.5 scheduling, LaTeX rendering, Claude-powered card generation, and CSV import.',
    glyph: '🧠',
    tile: 'from-indigo-400 to-indigo-700',
  },
  {
    href: '/banki',
    title: 'Banki',
    subtitle: 'Bookkeeping',
    description:
      'Import TD and PC Financial statements, deduplicated across overlapping exports, and posted to a double-entry general ledger with a trial balance and statement reconciliation.',
    glyph: '$',
    tile: 'from-green-400 to-green-700',
  },
  {
    href: '/bokki',
    title: 'Bokki',
    subtitle: withBusiness('Business books'),
    description:
      'Bookkeeping for the enkeltpersonforetak: key in expenses and sales with photos of the receipts, posted double-entry to an NS 4102 chart of accounts, with income statement, balance sheet and the MVA threshold.',
    glyph: 'kr',
    tile: 'from-red-400 to-red-700',
  },
  {
    href: '/porcupin',
    title: 'Porcupin',
    subtitle: 'Photo board',
    description:
      'Drop in photos, paste images, links or YouTube videos from the web, and sort them into projects. Search everything, add titles and descriptions, and link a photo to a Focus or Quilt node.',
    glyph: '🦔',
    tile: 'from-amber-500 to-stone-700',
  },
  {
    href: '/joblowski',
    title: 'Joblowski',
    subtitle: 'Job search',
    description:
      'Search Norwegian, European and remote job sources in one place and get alerts for new matches. Track every application, and keep résumé and cover letter versions that export to PDF.',
    glyph: '💼',
    tile: 'from-sky-400 to-sky-700',
  },
  {
    href: '/nutrilabel',
    title: 'NutriLabel',
    subtitle: withBusiness('Nutrition facts'),
    description:
      'Nutrition tables and package labels from your recipes, for Canada (bilingual Nutrition Facts) and Norway (næringsdeklarasjon): ingredients as printed on their packages or from the Canadian Nutrient File, the official rounding, and the working behind every number.',
    glyph: '🏷️',
    tile: 'from-emerald-400 to-emerald-700',
  },
  {
    href: '/next',
    title: 'Next',
    subtitle: 'What can be done now',
    description:
      'Every next action across your projects and org TODOs in one list, in the order you drag them into. Got a spare moment? Pop the top one off, and the next step of its chain takes its place.',
    glyph: '⛓️',
    tile: 'from-teal-400 to-teal-700',
  },
  {
    href: '/mail',
    title: 'Mail',
    subtitle: 'Your mailboxes',
    description:
      'Gmail or any IMAP mailbox, read here and kept in step: archive and delete here are archive and delete there. Process the inbox to zero, turning what needs doing into tasks in Next.',
    glyph: '✉️',
    tile: 'from-blue-400 to-indigo-600',
  },
  {
    href: '/dough',
    title: 'Dough',
    subtitle: 'Money fronts',
    description:
      'Every way you are trying to make money, each with its chain of next actions and a signal of whether it is moving: applications from Joblowski, sales from Bokki, money in you type yourself.',
    glyph: '🥐',
    tile: 'from-amber-400 to-orange-700',
  },
  {
    href: '/quilt',
    title: 'Quilt Graph',
    subtitle: 'Knowledge Graph',
    description: 'Personal knowledge graph explorer. Create nodes, connect them with typed edges, explore type hierarchies, and use AI thinking tools.',
    glyph: '🕸️',
    tile: 'from-rose-400 to-rose-700',
  },
  {
    href: '/periodic-table',
    title: 'Periodic Table',
    subtitle: 'Chemistry',
    description: 'Interactive periodic table with element details, categories, and properties.',
    glyph: 'Fe',
    tile: 'from-teal-400 to-teal-700',
  },
  {
    href: '/standard-model',
    title: 'Standard Model',
    subtitle: 'Particle Physics',
    description: 'Interactive chart of the 17 fundamental particles — quarks, leptons, and force carriers.',
    glyph: '⚛️',
    tile: 'from-violet-400 to-violet-700',
  },
  {
    href: '/grapher',
    title: 'Grapher',
    subtitle: 'Math & Visualization',
    description: 'MATLAB-style 2D/3D graphing with 20 prebuilt formulas (probability + calculus) and custom expression input.',
    glyph: '📈',
    tile: 'from-emerald-400 to-emerald-700',
  },
  {
    href: '/music',
    title: 'Piano & Voice Trainer',
    subtitle: 'Music',
    description: 'Full piano keyboard with real-time pitch detection. Sing or play to match target notes, train ear training through scales, and see your pitch live on the keys.',
    glyph: '🎹',
    tile: 'from-pink-400 to-pink-700',
  },
  {
    href: '/radio',
    title: 'Radio Lab',
    subtitle: 'Amateur radio',
    description: 'Explore the Canadian amateur bands, LC resonance and antennas, and AM / FM / SSB / CW modulation, then learn Morse with a keyer and a Koch trainer.',
    glyph: '📡',
    tile: 'from-sky-400 to-sky-700',
  },
  {
    href: '/skanki',
    title: 'Skanki',
    subtitle: 'Coming soon',
    description: 'Still to be decided.',
    image: '/icons/janki.svg',
    tile: '',
  },
]

/**
 * Scatterbrain's tile is whatever is being written now: its cover, its title,
 * and a link that lands back in it. The href stays fixed so the tile keeps its
 * place in the saved grid order when the current work changes.
 */
async function scatterbrainTile(): Promise<AppTile> {
  const session = await auth()
  const work = session?.user?.id ? await currentWork(session.user.id).catch(() => null) : null
  return {
    href: '/scatterbrain/open',
    title: work?.title ?? 'Scatterbrain',
    subtitle: work ? 'Scatterbrain · current work' : 'Writing',
    description: work
      ? `${work.logline || 'Pick up where you left off.'} ${work.wordCount.toLocaleString()} words so far.`
      : 'A binder for all your scattered writing: acts, chapters and scenes, a pegboard view, characters with images, and any of your notes edited as Markdown.',
    glyph: '🌀',
    image: work?.coverPinId ? imageSrc(work.coverPinId, 'thumb') : undefined,
    tile: 'from-fuchsia-400 to-purple-700',
  }
}

/**
 * Apps kept out of the published code (personal ones) add their tile through
 * JANKI_EXTRA_APPS in .env.local: a JSON list of tiles, e.g.
 * [{"href":"/mine","title":"Mine","subtitle":"…","description":"…","glyph":"🔎","tile":"from-sky-400 to-sky-700"}].
 * "extrasUrl" (optional) is where its tile asks for { caption, badge }.
 * Its "tile" must use gradient classes the code already uses (Tailwind only builds those it finds).
 */
function extraTiles(): AppTile[] {
  try {
    const list = JSON.parse(process.env.JANKI_EXTRA_APPS || '[]')
    return Array.isArray(list)
      ? list.filter((t) => t && typeof t.href === 'string' && typeof t.title === 'string' && t.href.startsWith('/'))
        .map((t) => ({ ...t, extrasUrl: typeof t.extrasUrl === 'string' && t.extrasUrl.startsWith('/') ? t.extrasUrl : undefined }))
      : []
  } catch {
    return []
  }
}

export default async function HomePage() {
  // Each app's latest item and waiting count come after, from /api/dashboard, so the screen never waits on them.
  const apps = [await scatterbrainTile(), ...APPS, ...extraTiles()]
  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <AppGrid apps={apps} />
    </div>
  )
}
