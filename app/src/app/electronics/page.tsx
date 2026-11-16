import { Metadata } from 'next'
import { ElectronicsLab } from './ElectronicsLab'

export const metadata: Metadata = { title: 'Electronics Lab' }

export default function Page() {
  return <ElectronicsLab />
}
