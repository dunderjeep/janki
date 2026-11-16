import { LOCAL_USER, ready } from '../standalone/host'
import { nutrilabelPageData } from 'nutrilabel/server'
import { NutriLabelApp } from 'nutrilabel/ui'

export const dynamic = 'force-dynamic'

export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await ready()
  const [data, { tab }] = await Promise.all([nutrilabelPageData(LOCAL_USER), searchParams])
  return <NutriLabelApp initialTab={tab} {...data} />
}
