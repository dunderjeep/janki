import type { Metadata } from 'next'
import QuiltGraph from './QuiltGraph'

export const metadata: Metadata = { title: 'Quilt Graph' }

export default function QuiltPage() {
  return <QuiltGraph />
}
