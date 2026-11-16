import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { overallView } from '@/lib/chains/store'
import { didForUser } from '@/lib/notesHost'
import NextApp from './NextApp'

export const metadata: Metadata = { title: 'Next' }
export const dynamic = 'force-dynamic'

export default async function NextPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  // Tasks live in your notes, and notes belong to a Bluesky identity.
  if (!(await didForUser(session!.user.id))) {
    return (
      <div className="max-w-xl mx-auto px-6 py-16 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-3">Next needs your notes</h1>
        <p className="text-gray-600 mb-6">
          Your tasks are kept in your notes, and notes belong to a Bluesky account. Link one, and Next is ready.
        </p>
        <Link href="/settings/accounts" className="inline-block rounded-lg bg-teal-600 px-4 py-2 text-white hover:bg-teal-700">
          Link a Bluesky account
        </Link>
      </div>
    )
  }
  return <NextApp initial={await overallView(session!.user.id)} />
}
