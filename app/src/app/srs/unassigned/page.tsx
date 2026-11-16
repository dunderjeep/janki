import { auth } from '@/auth'
import { db } from '@/db'
import { srsDecks, srsCards, srsCardStates, srsTopics, srsTopicDecks } from '@/db/schema/janki'
import { eq, sql } from 'drizzle-orm'
import Link from 'next/link'
import { UnassignedDecks } from '@/components/srs/UnassignedDecks'

export const metadata = { title: 'Unassigned decks' }

export default async function UnassignedPage() {
  const session = await auth()
  const uid = session!.user.id

  const [decks, deckLinks, topics, counts] = await Promise.all([
    db
      .select({ id: srsDecks.id, name: srsDecks.name, active: srsDecks.active })
      .from(srsDecks)
      .where(eq(srsDecks.ownerUid, uid))
      .orderBy(srsDecks.name),
    db.select({ deckId: srsTopicDecks.deckId }).from(srsTopicDecks),
    db
      .select({ id: srsTopics.id, name: srsTopics.name, color: srsTopics.color })
      .from(srsTopics)
      .where(eq(srsTopics.ownerUid, uid))
      .orderBy(srsTopics.sortOrder, srsTopics.name),
    db
      .select({
        deckId: srsCardStates.deckId,
        total:  sql<number>`count(*)`.as('total'),
        due:    sql<number>`count(*) filter (where janki.parse_due_at(${srsCardStates.srs}) <= NOW())`.as('due'),
      })
      .from(srsCardStates)
      .innerJoin(srsCards, eq(srsCards.id, srsCardStates.id))
      .where(eq(srsCardStates.ownerUid, uid))
      .groupBy(srsCardStates.deckId),
  ])

  const assigned = new Set(deckLinks.map(dl => dl.deckId))
  const countMap = Object.fromEntries(counts.map(c => [c.deckId, c]))

  const unassigned = decks
    .filter(d => !assigned.has(d.id))
    .map(d => ({
      id:     d.id,
      name:   d.name,
      active: d.active,
      total:  Number(countMap[d.id]?.total ?? 0),
      due:    Number(countMap[d.id]?.due   ?? 0),
    }))

  const totalCards = unassigned.reduce((s, d) => s + d.total, 0)

  return (
    <main className="max-w-2xl mx-auto px-4 py-10">
      <div className="mb-3 text-sm">
        <Link href="/srs" className="text-blue-600 hover:underline">← All Decks</Link>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">📂 Unassigned</h1>
        <p className="text-gray-500 mt-1 text-sm">
          {unassigned.length} deck{unassigned.length === 1 ? '' : 's'} · {totalCards} card{totalCards === 1 ? '' : 's'} —
          decks that belong to no topic. Tick some to file, merge or delete them.
        </p>
      </div>

      <UnassignedDecks
        decks={unassigned}
        topics={topics}
        allDecks={decks.map(d => ({ id: d.id, name: d.name }))}
      />
    </main>
  )
}
