import type { Metadata } from 'next'
import { auth } from '@/auth'
import '@/lib/mailHost'
import { mailPageData } from 'mail/server'
import { MailApp } from 'mail/ui'

export const metadata: Metadata = { title: 'Mail' }
export const dynamic = 'force-dynamic'

export default async function MailPage() {
  const session = await auth()
  return <MailApp {...await mailPageData(session!.user.id)} />
}
