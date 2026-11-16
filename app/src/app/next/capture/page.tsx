import type { Metadata, Viewport } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import CaptureApp from './CaptureApp'

export const metadata: Metadata = { title: 'Capture' }
export const viewport: Viewport = { width: 'device-width', initialScale: 1 }
export const dynamic = 'force-dynamic'

/** One box, for the phone: get it out of your head and into the inbox. */
export default async function CapturePage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login?callbackUrl=/next/capture')
  return <CaptureApp />
}
