import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import DailyApp from './DailyApp'

export const metadata: Metadata = { title: 'Daily' }
export const dynamic = 'force-dynamic'

/** Today's daily (or ?date=YYYY-MM-DD), to write in: journal, routine, whatever the day holds. */
export default async function DailyPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login?callbackUrl=/daily')
  const { date } = await searchParams
  return <DailyApp initialDate={date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null} />
}
