import { Metadata } from 'next'
import { RadioLab } from './RadioLab'

export const metadata: Metadata = { title: 'Amateur Radio Lab' }

export default function Page() {
  return <RadioLab />
}
