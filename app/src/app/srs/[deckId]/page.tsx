import { auth } from '@/auth'
import { db } from '@/db'
import { srsDecks, srsCards, srsCardStates, srsTopicDecks, srsTopics } from '@/db/schema/janki'
import { eq, and, sql } from 'drizzle-orm'
import Link from 'next/link'
import { Fragment } from 'react'
import { notFound } from 'next/navigation'
import { DeckCardList } from '@/components/srs/DeckCardList'
import { AddCardsButton } from '@/components/srs/AddCardsButton'
import { ReviewUpcomingButton } from '@/components/srs/ReviewUpcomingButton'
import { DeckSchedulingPanel } from '@/components/srs/DeckSchedulingPanel'
import { DeckTopicPicker } from '@/components/srs/DeckTopicPicker'
import { MetaEditor } from '@/components/srs/MetaEditor'
import { DeleteDeckButton } from '@/components/srs/DeleteDeckButton'

export default async function DeckPage({ params }: { params: Promise<{ deckId: string }> }) {
  const { deckId } = await params
  const session = await auth()
  const uid = session!.user.id

  const [deck] = await db
    .select()
    .from(srsDecks)
    .where(and(eq(srsDecks.id, deckId), eq(srsDecks.ownerUid, uid)))
    .limit(1)

  if (!deck) notFound()

  // Topics this deck belongs to
  const deckTopics = await db
    .select({ id: srsTopics.id, name: srsTopics.name, color: srsTopics.color })
    .from(srsTopicDecks)
    .innerJoin(srsTopics, eq(srsTopics.id, srsTopicDecks.topicId))
    .where(eq(srsTopicDecks.deckId, deckId))
    .orderBy(srsTopics.sortOrder, srsTopics.name)

  // Every topic (for the move-this-deck picker)
  const allTopics = await db
    .select({ id: srsTopics.id, name: srsTopics.name, color: srsTopics.color })
    .from(srsTopics)
    .where(eq(srsTopics.ownerUid, uid))
    .orderBy(srsTopics.sortOrder, srsTopics.name)

  // All decks (for the move-to-deck picker)
  const allDecks = await db
    .select({ id: srsDecks.id, name: srsDecks.name })
    .from(srsDecks)
    .where(eq(srsDecks.ownerUid, uid))
    .orderBy(srsDecks.name)

  // Cards with their SRS state
  const cards = await db
    .select({
      id: srsCards.id,
      front: srsCards.front,
      back: srsCards.back,
      tags: srsCards.tags,
      createdAt: srsCards.createdAt,
      state: sql<string>`coalesce(${srsCardStates.srs}->>'state', 'new')`.as('state'),
      dueAt: sql<string>`${srsCardStates.srs}->>'dueAt'`.as('dueAt'),
    })
    .from(srsCards)
    .leftJoin(srsCardStates, and(eq(srsCardStates.id, srsCards.id), eq(srsCardStates.ownerUid, uid)))
    .where(eq(srsCards.deckId, deckId))
    .orderBy(srsCards.front)

  const due = cards.filter((c) => !c.dueAt || c.dueAt <= new Date().toISOString()).length
  const byState = {
    new: cards.filter((c) => c.state === 'new').length,
    learning: cards.filter((c) => c.state === 'learning' || c.state === 'relearning').length,
    review: cards.filter((c) => c.state === 'review').length,
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-10">
      <div className="mb-3 flex items-center gap-1.5 flex-wrap text-sm">
        <Link href="/srs" className="text-blue-600 hover:underline">
          ← All Decks
        </Link>
        {deckTopics.map(t => (
          <Fragment key={t.id}>
            <span className="text-gray-300">/</span>
            <Link
              href={`/srs/topics/${t.id}`}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors text-gray-600 hover:text-blue-700"
            >
              {t.color && (
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
              )}
              {t.name}
            </Link>
          </Fragment>
        ))}
        <DeckTopicPicker
          deckId={deckId}
          allTopics={allTopics}
          initialTopicIds={deckTopics.map(t => t.id)}
        />
      </div>

      <div className="mb-6">
        <MetaEditor
          endpoint={`/api/srs/decks/${deckId}`}
          initialName={deck.name}
          initialDescription={deck.description}
          namePlaceholder="Deck name"
          descriptionPlaceholder="Description — what this deck covers"
        />
        <div className="flex items-center gap-2 flex-wrap mt-3">
          <Link
            href={`/srs/${deckId}/graph`}
            className="text-sm text-gray-600 hover:text-gray-900 border border-gray-200 hover:border-gray-400 px-3 py-2 rounded-lg transition-colors"
          >
            Graph
          </Link>
          <Link
            href={`/srs/${deckId}/cleanup`}
            className="text-sm text-gray-600 hover:text-gray-900 border border-gray-200 hover:border-gray-400 px-3 py-2 rounded-lg transition-colors"
          >
            ✦ Clean up
          </Link>
          <AddCardsButton deckId={deckId} />
          <Link
            href={`/srs/${deckId}/autoflash`}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2 rounded-lg transition-colors text-sm"
          >
            ⚡ Auto-Flash
          </Link>
          {due > 0 && (
            <Link
              href={`/srs/${deckId}/study`}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-2 rounded-lg transition-colors"
            >
              Study ({due} due)
            </Link>
          )}
          <DeleteDeckButton
            deckId={deckId}
            deckName={deck.name}
            cardCount={cards.length}
            redirectTo="/srs"
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        {[
          { label: 'New', count: byState.new, color: 'bg-gray-100 text-gray-700' },
          { label: 'Learning', count: byState.learning, color: 'bg-orange-100 text-orange-700' },
          { label: 'Review', count: byState.review, color: 'bg-green-100 text-green-700' },
        ].map(({ label, count, color }) => (
          <div key={label} className={`rounded-lg px-4 py-3 text-center ${color}`}>
            <p className="text-2xl font-bold">{count}</p>
            <p className="text-xs font-medium mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Review upcoming + Auto-flash secondary actions */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <ReviewUpcomingButton deckId={deckId} />
        {cards.length > 0 && (
          <Link
            href={`/srs/${deckId}/study?all=1`}
            className="text-sm font-semibold text-indigo-700 hover:text-indigo-900 border border-indigo-200 hover:border-indigo-400 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
            title="Study every card in this deck again, whether or not it's due"
          >
            ↺ Review all ({cards.length})
          </Link>
        )}
      </div>

      <DeckCardList cards={cards} deckId={deckId} allDecks={allDecks} />

      <DeckSchedulingPanel deckId={deckId} initial={deck.fsrsParams ?? {}} />
    </main>
  )
}
