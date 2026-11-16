import type { Metadata } from 'next'
import OrgCanvas from './OrgCanvas'

export const metadata: Metadata = { title: 'Quilt — org-roam' }

// Reads org-roam.db and the horizon files off disk on every request; there is
// nothing here to prerender.
export const dynamic = 'force-dynamic'

export default function OrgQuiltPage() {
  return <OrgCanvas />
}
