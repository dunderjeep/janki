/**
 * Joblowski's to-dos as next actions of the job search front: apply to a saved
 * job, prepare for an interview, answer an offer. They come from the tracker
 * itself, so they clear when the job's status moves on there, or it is parked.
 */
import { sql } from 'drizzle-orm'
import { db } from '@/db'
import '@/lib/joblowskiHost'
import { wakeParked } from 'joblowski/server'
import type { ChainNode, DomainInfo, NextAction } from './tree'
import { NO_GTD } from './tree'

const VERB: Record<string, string> = {
  saved: 'Apply',
  interview: 'Prepare for the interview',
  offer: 'Answer the offer',
}

export async function joblowskiActions(uid: string, domain: DomainInfo, front: ChainNode): Promise<NextAction[]> {
  await wakeParked(uid)
  const { rows } = await db.execute<{ id: string; company: string; role: string; status: string; due_date: string | null }>(sql`
    select id, company, role, status, due_date::text
      from joblowski.applications
     where owner_uid = ${uid} and status in ('saved', 'interview', 'offer')
     order by case status when 'offer' then 0 when 'interview' then 1 else 2 end,
              due_date nulls last, updated_at desc`)
  return rows.map((a) => ({
    key: `joblowski:${a.id}`,
    slot: `joblowski:${a.id}`,
    source: 'joblowski' as const,
    ...NO_GTD,
    domain: domain.key,
    domainTitle: domain.title,
    href: `/joblowski?tab=tracker&job=${encodeURIComponent(a.id)}`,
    title: `${VERB[a.status]}: ${a.role} at ${a.company}`,
    path: [front.title, 'Joblowski'],
    purpose: front.purpose,
    then: null,
    needsStep: false,
    needsFirstStep: false,
    id: null,
    frontId: front.id,
    task: null,
    job: { id: a.id, status: a.status },
    deadline: a.due_date,
    scheduled: null,
    links: [],
    waits: [],
  }))
}

/**
 * Adds Joblowski's to-dos after the job search front's own steps. A front with
 * Joblowski work waiting is not a front without a next step, so that prompt goes.
 */
export async function withJoblowski(uid: string, domain: DomainInfo, fronts: ChainNode[], actions: NextAction[]): Promise<NextAction[]> {
  const front = fronts.find((f) => f.signal === 'joblowski' && !f.parked && !f.done)
  if (!front) return actions
  const extra = await joblowskiActions(uid, domain, front)
  if (extra.length === 0) return actions
  const rest = actions.filter((a) => !(a.frontId === front.id && a.needsFirstStep))
  // After the front's own steps; or, if it has none open, before the next front's.
  const order = (a: NextAction) => fronts.findIndex((f) => f.id === a.frontId)
  const mine = fronts.indexOf(front)
  let cut = rest.findIndex((a) => a.source === 'chain' && order(a) > mine)
  for (let i = 0; i < rest.length; i++) if (rest[i].frontId === front.id) cut = i + 1
  if (cut < 0) cut = rest.length
  return [...rest.slice(0, cut), ...extra, ...rest.slice(cut)]
}
