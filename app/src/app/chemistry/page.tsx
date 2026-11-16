import { Metadata } from 'next'
import { ChemLab } from './ChemLab'

export const metadata: Metadata = { title: 'Chem Lab' }

export default function Page() {
  return <ChemLab />
}
