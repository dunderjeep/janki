import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'

const run = promisify(execFile)

/** Server runs from app/, and the tool lives beside the other deploy scripts. */
const TOOL = path.join(process.cwd(), '..', 'deploy', 'phone-access')

async function phoneAccess(args: string[]) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { stdout } = await run(TOOL, ['--json', ...args], { timeout: 180_000 })
    return NextResponse.json(JSON.parse(stdout))
  } catch (err) {
    console.error('[phone-access]', err)
    return NextResponse.json({ error: 'The phone access check could not run' }, { status: 500 })
  }
}

export async function GET() {
  return phoneAccess([])
}

export async function POST() {
  return phoneAccess(['--repair'])
}
