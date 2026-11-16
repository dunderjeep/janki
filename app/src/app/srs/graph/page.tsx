import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { SrsGraphCanvas } from '@/components/srs/graph/SrsGraphCanvas'

export default async function DeckGraphPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/api/auth/signin')

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 shrink-0">
        <Link href="/srs" className="text-sm text-blue-600 hover:underline">← Decks</Link>
        <span className="text-gray-300">|</span>
        <h1 className="text-sm font-semibold text-gray-800">Deck graph</h1>
        <span className="text-xs text-gray-400 ml-2">
          Drag a node handle to connect · select edge + Delete to remove
        </span>
      </div>

      {/* Full-height canvas */}
      <div className="flex-1 min-h-0">
        <SrsGraphCanvas mode="decks" />
      </div>
    </div>
  )
}
