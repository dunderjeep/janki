import type { Metadata } from 'next'
import { auth } from '@/auth'
import { listBoards, listPins } from '@/lib/porcupin/store'
import PorcupinBoard from './PorcupinBoard'

export const metadata: Metadata = { title: 'Porcupin' }
export const dynamic = 'force-dynamic'

type Search = { project?: string; q?: string; sort?: string; pin?: string }

export default async function PorcupinPage({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await auth()
  const uid = session!.user.id
  const [pins, boards, search] = await Promise.all([listPins(uid), listBoards(uid), searchParams])
  return <PorcupinBoard initialPins={pins} initialBoards={boards} initialSearch={search} />
}
