import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { currentWork } from '@/lib/scatterbrain/store'

export const dynamic = 'force-dynamic'

/** Where the home-screen tile goes: back into whatever was last open. */
export default async function OpenCurrentWork() {
  const session = await auth()
  const work = await currentWork(session!.user.id)
  redirect(work ? `/scatterbrain/${work.id}` : '/scatterbrain')
}
