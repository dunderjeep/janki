import { Metadata } from 'next'
import { AnatomyLab } from './AnatomyLab'

export const metadata: Metadata = { title: 'Human Anatomy Lab' }

export default function Page() {
  return <AnatomyLab />
}
