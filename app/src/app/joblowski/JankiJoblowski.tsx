'use client'

import type { ComponentProps } from 'react'
import { JoblowskiApp } from 'joblowski/ui'
import JobSearchPanel from './JobSearchPanel'

/** Joblowski as janki shows it: with the job search front from Dough above the tabs. */
export default function JankiJoblowski(props: Omit<ComponentProps<typeof JoblowskiApp>, 'panel'>) {
  return <JoblowskiApp {...props} panel={(applications) => <JobSearchPanel applications={applications} />} />
}
