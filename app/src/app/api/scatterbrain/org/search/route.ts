import { NextRequest } from 'next/server'
import { asUser } from '@/lib/porcupin/route'
import { searchOrgFiles } from '@/lib/scatterbrain/orgFiles'

export async function GET(req: NextRequest) {
  return asUser(async (uid) => {
    return { hits: await searchOrgFiles(uid, (req.nextUrl.searchParams.get('q') ?? '').slice(0, 200)) }
  })
}
