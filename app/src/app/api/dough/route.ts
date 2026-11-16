import { asUser } from '@/lib/chains/route'
import { doughView } from '@/lib/dough/view'

export const dynamic = 'force-dynamic'

export function GET() {
  return asUser((uid) => doughView(uid))
}
