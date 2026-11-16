/**
 * Job boards that are linked to rather than searched from here. LinkedIn,
 * Indeed and FINN do not permit automated collection, so these open the site's
 * own search with the words already filled in.
 *
 * These are only the starting set: each person gets their own copy the first
 * time they open the tab, and edits or removes it from there.
 *
 * {q} is the search and {l} the location.
 */
export type Board = { name: string; urlTemplate: string; note: string; quick?: boolean }

export const BOARD_GROUPS: { title: string; boards: Board[] }[] = [
  {
    title: 'Norway',
    boards: [
      { name: 'Arbeidsplassen', urlTemplate: 'https://arbeidsplassen.nav.no/stillinger?q={q}', note: 'NAV, the national job database', quick: true },
      { name: 'FINN jobb', urlTemplate: 'https://www.finn.no/job/search?q={q}', note: 'Largest commercial board', quick: true },
      { name: 'Jobbnorge', urlTemplate: 'https://www.jobbnorge.no/search?q={q}', note: 'Universities and the public sector', quick: true },
      { name: 'Karrierestart', urlTemplate: 'https://karrierestart.no/ledig-stilling?q={q}', note: 'Graduates and early career', quick: true },
    ],
  },
  {
    title: 'International',
    boards: [
      { name: 'LinkedIn', urlTemplate: 'https://www.linkedin.com/jobs/search/?keywords={q}&location={l}', note: 'Set up its own alerts too', quick: true },
      { name: 'Indeed Norway', urlTemplate: 'https://no.indeed.com/jobs?q={q}&l={l}', note: '', quick: true },
      { name: 'Job Bank Canada', urlTemplate: 'https://www.jobbank.gc.ca/jobsearch/jobsearch?searchstring={q}&locationstring={l}', note: 'Government of Canada' },
    ],
  },
  {
    title: 'Research and museums',
    boards: [
      { name: 'EURAXESS', urlTemplate: 'https://euraxess.ec.europa.eu/jobs/search?keywords={q}', note: 'EU research jobs' },
      { name: 'Academic Positions', urlTemplate: 'https://academicpositions.com/find-jobs?search={q}', note: 'European universities' },
    ],
  },
  {
    title: 'Remote',
    boards: [
      { name: 'We Work Remotely', urlTemplate: 'https://weworkremotely.com/remote-jobs/search?term={q}', note: '' },
      { name: 'Remotive', urlTemplate: 'https://remotive.com/remote-jobs?query={q}', note: '' },
      { name: 'Remote OK', urlTemplate: 'https://remoteok.com/', note: '' },
    ],
  },
]

export function boardUrl(template: string, q: string, l: string): string {
  return template.replace(/\{q\}/g, encodeURIComponent(q.trim())).replace(/\{l\}/g, encodeURIComponent(l.trim()))
}

/** Boards in display order, grouped by section in the order each section first appears. */
export function groupBoards<T extends { section: string }>(boards: T[]): { title: string; boards: T[] }[] {
  const groups = new Map<string, T[]>()
  for (const b of boards) groups.set(b.section, [...(groups.get(b.section) ?? []), b])
  return [...groups].map(([title, list]) => ({ title, boards: list }))
}
