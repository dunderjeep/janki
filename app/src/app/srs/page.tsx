import { auth } from '@/auth'
import { db } from '@/db'
import { srsDecks, srsCards, srsCardStates, srsTopics, srsTopicParents, srsTopicDecks } from '@/db/schema/janki'
import { eq, sql } from 'drizzle-orm'
import Link from 'next/link'
import { GenerateDeckButton } from '@/components/srs/GenerateDeckButton'
import { SearchBar } from '@/components/srs/SearchBar'
import { ConnectButton } from '@/components/srs/ConnectButton'
import { FsrsSettingsPanel } from '@/components/srs/FsrsSettingsPanel'
import { TopicTree } from '@/components/srs/TopicTree'
import { ResetProgressButton } from '@/components/srs/ResetProgressButton'

export default async function DeckListPage() {
  const session = await auth()
  const uid = session!.user.id

  // Topics + relationships
  const [topics, parents, deckLinks] = await Promise.all([
    db.select().from(srsTopics).where(eq(srsTopics.ownerUid, uid)).orderBy(srsTopics.sortOrder, srsTopics.createdAt),
    db.select().from(srsTopicParents),
    db.select().from(srsTopicDecks),
  ])

  // Decks
  const decks = await db
    .select({
      id:          srsDecks.id,
      name:        srsDecks.name,
      description: srsDecks.description,
      active:      srsDecks.active,
    })
    .from(srsDecks)
    .where(eq(srsDecks.ownerUid, uid))
    .orderBy(srsDecks.name)

  // Card + due counts per deck
  const counts = await db
    .select({
      deckId: srsCardStates.deckId,
      total:  sql<number>`count(*)`.as('total'),
      due:    sql<number>`count(*) filter (where janki.parse_due_at(${srsCardStates.srs}) <= NOW())`.as('due'),
    })
    .from(srsCardStates)
    .innerJoin(srsCards, eq(srsCards.id, srsCardStates.id))
    .innerJoin(srsDecks, eq(srsDecks.id, srsCardStates.deckId))
    .where(eq(srsCardStates.ownerUid, uid))
    .groupBy(srsCardStates.deckId)
  const countMap = Object.fromEntries(counts.map(c => [c.deckId, c]))

  // Active topic set (for totalDue filtering)
  const activeTopicIds = new Set(topics.filter(t => t.active).map(t => t.id))

  // A deck is eligible if active AND (no topics OR at least one active topic)
  const deckTopicIds = new Map<string, string[]>()
  for (const dl of deckLinks) {
    if (!deckTopicIds.has(dl.deckId)) deckTopicIds.set(dl.deckId, [])
    deckTopicIds.get(dl.deckId)!.push(dl.topicId)
  }

  const totalDue = decks
    .filter(d => {
      if (!d.active) return false
      const topicIds = deckTopicIds.get(d.id) ?? []
      if (topicIds.length > 0 && !topicIds.some(t => activeTopicIds.has(t))) return false
      return true
    })
    .reduce((sum, d) => sum + Number(countMap[d.id]?.due ?? 0), 0)

  // Build deck summaries for TopicTree
  const deckSummaries = decks.map(d => ({
    id:          d.id,
    name:        d.name,
    description: d.description,
    active:      d.active,
    total:       Number(countMap[d.id]?.total ?? 0),
    due:         Number(countMap[d.id]?.due   ?? 0),
  }))

  const totalCards = deckSummaries.reduce((s, d) => s + d.total, 0)

  const topicSummaries = topics.map(t => ({
    id:          t.id,
    name:        t.name,
    description: t.description,
    active:      t.active,
    sortOrder:   t.sortOrder,
    color:       t.color,
  }))

  return (
    <main className="max-w-2xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Your Decks</h1>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <Link
            href="/srs/graph"
            className="text-sm text-gray-600 hover:text-gray-900 border border-gray-200 hover:border-gray-400 px-3 py-1.5 rounded-lg transition-colors"
          >
            Graph
          </Link>
          <ConnectButton />
          <GenerateDeckButton />
          {totalCards > 0 && (
            <ResetProgressButton
              endpoint="/api/srs/reset"
              scopeLabel="every deck you own"
              scopeNote="Every topic, every deck — the whole collection."
              cardCount={totalCards}
              variant="button"
              reloadOnDone
            />
          )}
          {totalDue > 0 && (
            <>
              <Link
                href="/srs/autoflash"
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2 rounded-lg transition-colors text-sm"
              >
                ⚡ Auto-Flash All
              </Link>
              <Link
                href="/srs/study"
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-2 rounded-lg transition-colors"
              >
                Study All Due ({totalDue})
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Global search */}
      <div className="mb-6">
        <SearchBar placeholder="Search across all decks…" />
      </div>

      {decks.length === 0 ? (
        <p className="text-gray-500">No decks yet.</p>
      ) : (
        <>
          <TopicTree
            initialTopics={topicSummaries}
            initialParents={parents}
            initialDeckLinks={deckLinks}
            initialDecks={deckSummaries}
          />
          <FsrsSettingsPanel deckIds={decks.map(d => d.id)} />
        </>
      )}
    </main>
  )
}
