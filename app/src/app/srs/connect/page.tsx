import { Metadata } from 'next'
import { ConnectPage } from './ConnectPage'

export const metadata: Metadata = { title: 'Card Connections' }

export default function Page() {
  return <ConnectPage />
}
