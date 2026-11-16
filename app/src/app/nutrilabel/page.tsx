import type { Metadata } from 'next'
import { auth } from '@/auth'
import '@/lib/nutrilabelHost'
import { nutrilabelPageData } from 'nutrilabel/server'
import { NutriLabelApp } from 'nutrilabel/ui'

export const metadata: Metadata = { title: 'NutriLabel' }
export const dynamic = 'force-dynamic'

export default async function NutriLabelPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const session = await auth()
  const [data, { tab }] = await Promise.all([nutrilabelPageData(session!.user.id), searchParams])
  return <NutriLabelApp initialTab={tab} {...data} />
}
