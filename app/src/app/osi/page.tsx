import { Metadata } from 'next'
import { OSILab } from './OSILab'

export const metadata: Metadata = { title: 'OSI / CCNA Lab' }

export default function Page() {
  return <OSILab />
}
