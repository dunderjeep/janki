import { routineToday } from '@/lib/orgDailies'
import { notesRoute } from '@/lib/notesHost'

export const dynamic = 'force-dynamic'

export async function GET() {
  return notesRoute((did) => routineToday(did))
}
