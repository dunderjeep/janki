import { auth } from '@/auth'
import { db } from '@/db'
import { srsDecks } from '@/db/schema/janki'
import { eq, and } from 'drizzle-orm'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { SrsGraphCanvas } from '@/components/srs/graph/SrsGraphCanvas'

export default async function DeckCardGraphPage({
  params,
}: {
  params: Promise<{ deckId: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/api/auth/signin')
  const uid = session.user.id
  const { deckId } = await params

  const [deck] = await db
    .select({ name: srsDecks.name })
    .from(srsDecks)
    .where(and(eq(srsDecks.id, deckId), eq(srsDecks.ownerUid, uid)))
    .limit(1)
  if (!deck) notFound()

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 shrink-0">
        <Link href="/srs" className="text-sm text-blue-600 hover:underline">← Decks</Link>
        <span className="text-gray-300">|</span>
        <Link href={`/srs/${deckId}`} className="text-sm text-blue-600 hover:underline">{deck.name}</Link>
        <span className="text-gray-300">|</span>
        <h1 className="text-sm font-semibold text-gray-800">Card graph</h1>
        <span className="text-xs text-gray-400 ml-2">
          Drag a node handle to connect · select edge + Delete to remove
        </span>
      </div>

      {/* Full-height canvas */}
      <div className="flex-1 min-h-0">
        <SrsGraphCanvas mode="cards" deckId={deckId} deckName={deck.name} />
      </div>
    </div>
  )
}
