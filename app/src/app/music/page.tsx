import type { Metadata } from 'next'
import { MusicLab } from './MusicLab'

export const metadata: Metadata = { title: 'Music Lab' }

export default function MusicPage() {
  return <MusicLab />
}
