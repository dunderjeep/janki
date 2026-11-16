/**
 * The domains of the next-action system: one org file each. Another domain
 * is another entry here and another org file.
 */
import type { DomainInfo } from './tree'

export type Domain = DomainInfo & { file: string; seed: string }

const DOUGH_SEED = `#+TITLE: Dough
#+PROPERTY: ORDERED t
#+STARTUP: content
# janki's /dough reads this file. Each top-level heading is a front; the
# headings under it are steps, done top to bottom unless a heading has
# :ORDERED: nil. A front tagged :parked: is an idea kept for later.
# :SIGNAL: says where a front's progress is measured: joblowski, bokki or tally.

* Job search
:PROPERTIES:
:SIGNAL: joblowski
:END:
* My small business
:PROPERTIES:
:SIGNAL: bokki
:END:
* A side project
:PROPERTIES:
:SIGNAL: tally
:END:
* An idea for later                                                :parked:
`

const LIFE_SEED = `#+title: tasks
`

/**
 * Money is dough.org. Life is tasks.org, where C-c c t captures, so a task
 * added from /next and one captured in Emacs land in the same place. Its
 * top-level TODOs are tasks of their own; a heading with steps under it is a
 * project; a plain heading ("Bills") just groups.
 */
export const DOMAINS: Domain[] = [
  { key: 'life', title: 'Life', href: '/next', file: 'tasks.org', seed: LIFE_SEED },
  { key: 'money', title: 'Money', href: '/dough', file: 'dough.org', seed: DOUGH_SEED, nagEmpty: true },
]

export function domainFor(key: string): Domain | null {
  return DOMAINS.find((d) => d.key === key) ?? null
}

/** The loose TODOs in the agenda files, shown in the overall list. */
export const ORG_TASKS: DomainInfo = { key: 'org', title: 'Org tasks', href: '/quilt/org' }
