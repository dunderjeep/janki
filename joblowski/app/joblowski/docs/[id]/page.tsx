import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { LOCAL_USER, ready } from '../../../../standalone/host'
import { getDocument, JoblowskiError } from 'joblowski/server'
import { DocEditor } from 'joblowski/ui'

export const metadata: Metadata = { title: 'Joblowski' }
export const dynamic = 'force-dynamic'

export default async function DocPage({ params }: { params: Promise<{ id: string }> }) {
  await ready()
  const { id } = await params
  const doc = await getDocument(LOCAL_USER, id).catch((err) => {
    if (err instanceof JoblowskiError && err.status === 404) notFound()
    throw err
  })
  return <DocEditor initial={doc} />
}
