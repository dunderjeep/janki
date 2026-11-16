import { asUser } from '@/lib/chains/route'
import { overallView } from '@/lib/chains/store'

export const dynamic = 'force-dynamic'

/** Every next action, across the domains and the loose org TODOs, in your order. */
export function GET() {
  return asUser((uid) => overallView(uid))
}
