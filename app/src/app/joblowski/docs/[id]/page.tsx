import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { auth } from '@/auth'
import '@/lib/joblowskiHost'
import { getDocument, JoblowskiError } from 'joblowski/server'
import { DocEditor } from 'joblowski/ui'

export const metadata: Metadata = { title: 'Joblowski' }
export const dynamic = 'force-dynamic'

export default async function DocPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const { id } = await params
  const doc = await getDocument(session!.user.id, id).catch((err) => {
    if (err instanceof JoblowskiError && err.status === 404) notFound()
    throw err
  })
  return <DocEditor initial={doc} />
}
