import type { Metadata } from 'next'
import Grapher from './Grapher'

export const metadata: Metadata = { title: 'Grapher' }

export default function GrapherPage() {
  return <Grapher />
}
