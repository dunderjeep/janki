import { auth } from '@/auth'
import { db } from '@/db'
import {
  srsDecks, srsCards, srsCardStates,
  srsTopics, srsTopicParents, srsTopicDecks,
} from '@/db/schema/janki'
import { eq, sql } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Fragment } from 'react'
import { TopicTree } from '@/components/srs/TopicTree'
import { FsrsSettingsPanel } from '@/components/srs/FsrsSettingsPanel'
import { MetaEditor } from '@/components/srs/MetaEditor'

// Recursively collect all descendant topic IDs (including the root)
function collectDescendants(
  rootId: string,
  childMap: Map<string, string[]>,
  out = new Set<string>(),
): Set<string> {
  if (out.has(rootId)) return out
  out.add(rootId)
  for (const childId of childMap.get(rootId) ?? []) {
    collectDescendants(childId, childMap, out)
  }
  return out
}

export default async function TopicPage({
  params,
}: {
  params: Promise<{ topicId: string }>
}) {
  const { topicId } = await params
  const session = await auth()
  const uid = session!.user.id

  // Fetch the topic itself
  const [topic] = await db
    .select()
    .from(srsTopics)
    .where(eq(srsTopics.id, topicId))
    .limit(1)

  if (!topic || topic.ownerUid !== uid) notFound()

  // All topics + relationships (same as srs/page.tsx)
  const [allTopics, allParents, allDeckLinks] = await Promise.all([
    db.select().from(srsTopics).where(eq(srsTopics.ownerUid, uid)).orderBy(srsTopics.sortOrder, srsTopics.createdAt),
    db.select().from(srsTopicParents),
    db.select().from(srsTopicDecks),
  ])

  // Build childMap to traverse descendants
  const childMap = new Map<string, string[]>()
  for (const p of allParents) {
    if (!childMap.has(p.parentId)) childMap.set(p.parentId, [])
    childMap.get(p.parentId)!.push(p.topicId)
  }

  // Ancestor chain for breadcrumb (walk up parentMap)
  const parentMap = new Map<string, string>()
  for (const p of allParents) parentMap.set(p.topicId, p.parentId)  // first parent only

  function getAncestors(id: string): { id: string; name: string; color: string | null }[] {
    const chain: { id: string; name: string; color: string | null }[] = []
    let cur = parentMap.get(id)
    while (cur) {
      const t = allTopics.find(t => t.id === cur)
      if (!t) break
      chain.unshift({ id: t.id, name: t.name, color: t.color })
      cur = parentMap.get(cur)
    }
    return chain
  }

  const ancestors = getAncestors(topicId)

  // Subtree of relevant topic IDs
  const subtreeIds = collectDescendants(topicId, childMap)

  // Filter topics + relationships to subtree only
  const subtreeTopics   = allTopics.filter(t => subtreeIds.has(t.id))
  const subtreeParents  = allParents.filter(p => subtreeIds.has(p.topicId) && subtreeIds.has(p.parentId))
  const subtreeDeckLinks = allDeckLinks.filter(dl => subtreeIds.has(dl.topicId))
  const subtreeDeckIds  = new Set(subtreeDeckLinks.map(dl => dl.deckId))

  // Decks in this subtree with counts
  const decks = await db
    .select({ id: srsDecks.id, name: srsDecks.name, description: srsDecks.description, active: srsDecks.active })
    .from(srsDecks)
    .where(eq(srsDecks.ownerUid, uid))

  const subtreeDecks = decks.filter(d => subtreeDeckIds.has(d.id))

  const counts = await db
    .select({
      deckId: srsCardStates.deckId,
      total:  sql<number>`count(*)`.as('total'),
      due:    sql<number>`count(*) filter (where janki.parse_due_at(${srsCardStates.srs}) <= NOW())`.as('due'),
    })
    .from(srsCardStates)
    .where(eq(srsCardStates.ownerUid, uid))
    .groupBy(srsCardStates.deckId)
  const countMap = Object.fromEntries(counts.map(c => [c.deckId, c]))

  const deckSummaries = subtreeDecks.map(d => ({
    id:          d.id,
    name:        d.name,
    description: d.description,
    active:      d.active,
    total:       Number(countMap[d.id]?.total ?? 0),
    due:         Number(countMap[d.id]?.due   ?? 0),
  }))

  const topicSummaries = subtreeTopics.map(t => ({
    id:          t.id,
    name:        t.name,
    description: t.description,
    active:      t.active,
    sortOrder:   t.sortOrder,
    color:       t.color,
  }))

  const totalDue   = deckSummaries.reduce((s, d) => s + d.due, 0)
  const totalCards = deckSummaries.reduce((s, d) => s + d.total, 0)

  return (
    <main className="max-w-2xl mx-auto px-4 py-10">
      {/* Breadcrumb */}
      <div className="mb-4 flex items-center gap-1.5 flex-wrap text-sm">
        <Link href="/srs" className="text-blue-600 hover:underline">All Decks</Link>
        {ancestors.map(a => (
          <Fragment key={a.id}>
            <span className="text-gray-300">/</span>
            <Link
              href={`/srs/topics/${a.id}`}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors text-gray-600 hover:text-blue-700"
            >
              {a.color && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: a.color }} />}
              {a.name}
            </Link>
          </Fragment>
        ))}
        <span className="text-gray-300">/</span>
        <span className="text-gray-800 font-medium">{topic.name}</span>
      </div>

      {/* Header */}
      <div className="mb-6">
        <MetaEditor
          endpoint={`/api/srs/topics/${topicId}`}
          initialName={topic.name}
          initialDescription={topic.description}
          namePlaceholder="Topic name"
          descriptionPlaceholder="Description — what this topic covers"
          leading={topic.color
            ? <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: topic.color }} />
            : undefined}
        />
        <div className="flex items-center gap-2 flex-wrap mt-3">
          {totalCards > 0 && (
            <Link
              href={`/srs/study?topicId=${topicId}&all=1`}
              className="text-sm font-semibold text-indigo-700 hover:text-indigo-900 border border-indigo-200 hover:border-indigo-400 bg-indigo-50 hover:bg-indigo-100 px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
              title="Study every card in this topic again, whether or not it's due"
            >
              ↺ Review All ({totalCards})
            </Link>
          )}
          {totalDue > 0 && (
            <Link
              href={`/srs/study?topicId=${topicId}`}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-lg transition-colors text-sm"
            >
              Study All Due ({totalDue})
            </Link>
          )}
        </div>
      </div>

      {deckSummaries.length === 0 && topicSummaries.length <= 1 ? (
        <p className="text-gray-400 text-sm">No decks in this topic yet.</p>
      ) : (
        <>
          <TopicTree
            initialTopics={topicSummaries}
            initialParents={subtreeParents}
            initialDeckLinks={subtreeDeckLinks}
            initialDecks={deckSummaries}
            rootTopicId={topicId}
          />
          {deckSummaries.length > 0 && (
            <FsrsSettingsPanel deckIds={deckSummaries.map(d => d.id)} />
          )}
        </>
      )}
    </main>
  )
}
