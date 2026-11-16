import { domainFor } from '@/lib/chains/domains'
import { domainView, type DomainView } from '@/lib/chains/store'
import { today } from '@/lib/chains/route'
import { doughSignals } from './signals'
import { listLinks, type MoneyLink } from './links'
import type { DoughSignals } from './money'

export type DoughView = DomainView & { signals: DoughSignals; links: MoneyLink[] }

export async function doughView(uid: string): Promise<DoughView> {
  const view = await domainView(uid, domainFor('money')!)
  const [signals, links] = await Promise.all([doughSignals(uid, view.fronts, today()), listLinks(uid)])
  return { ...view, signals, links }
}
