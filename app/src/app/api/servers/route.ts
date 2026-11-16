/**
 * GET    /api/servers        – list TCP ports currently being listened on
 * DELETE /api/servers?pid=N  – stop that process (SIGTERM, then SIGKILL)
 *
 * A page that can kill processes needs narrow limits, so:
 *   - the request must come from loopback; anything else is refused
 *   - only processes owned by the same user as this server may be signalled
 *   - this Next.js process, its parent, and pid 1 are never signallable
 *   - SIGTERM first, SIGKILL only if it is still alive after a grace period
 *
 * `ss` is used rather than `lsof` because it is present on stock Linux and
 * needs no privileges to see the current user's own sockets.
 */

import { NextResponse } from 'next/server'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile } from 'node:fs/promises'

const run = promisify(execFile)

export const dynamic = 'force-dynamic'   // never cache a live process list

export interface ServerProcess {
  pid: number
  name: string
  ports: number[]
  addresses: string[]
  command: string
  uptime: string
  self: boolean          // this Next server — shown, but not stoppable
  protected: boolean     // pid 1, our parent, or another user's process
}

/** Only loopback callers. This is a local development tool. */
function isLocal(req: Request): boolean {
  const host = new URL(req.url).hostname
  return host === 'localhost' || host === '127.0.0.1' || host === '::1'
}

/** Read /proc/<pid> for the command line, start time and owning uid. */
async function inspect(pid: number) {
  try {
    const [cmdline, status] = await Promise.all([
      readFile(`/proc/${pid}/cmdline`, 'utf8').catch(() => ''),
      readFile(`/proc/${pid}/status`, 'utf8').catch(() => ''),
    ])
    const uid = Number(status.match(/^Uid:\s+(\d+)/m)?.[1] ?? -1)
    const command = cmdline.replace(/\0/g, ' ').trim()
    return { command, uid }
  } catch {
    return { command: '', uid: -1 }
  }
}

/** Seconds since a pid started, formatted. Derived from /proc/<pid>/stat. */
async function uptimeOf(pid: number): Promise<string> {
  try {
    const [stat, sysUptime] = await Promise.all([
      readFile(`/proc/${pid}/stat`, 'utf8'),
      readFile('/proc/uptime', 'utf8'),
    ])
    // field 22 is starttime, in clock ticks since boot; skip the comm field,
    // which may itself contain spaces inside parentheses
    const after = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
    const startTicks = Number(after[19])
    const seconds = Number(sysUptime.split(' ')[0]) - startTicks / 100
    if (!Number.isFinite(seconds) || seconds < 0) return ''
    if (seconds < 60) return `${Math.round(seconds)}s`
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`
    if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`
    return `${(seconds / 86400).toFixed(1)}d`
  } catch {
    return ''
  }
}

export async function GET(req: Request) {
  if (!isLocal(req)) {
    return NextResponse.json({ error: 'local requests only' }, { status: 403 })
  }

  let stdout = ''
  try {
    ;({ stdout } = await run('ss', ['-lptnH']))
  } catch {
    return NextResponse.json(
      { error: 'could not run `ss` — is iproute2 installed?' }, { status: 500 })
  }

  // One row per socket; group them by pid so a process listening on several
  // ports appears once.
  const byPid = new Map<number, { name: string; ports: Set<number>; addresses: Set<string> }>()

  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue
    const local = line.trim().split(/\s+/)[3] ?? ''
    const port = Number(local.slice(local.lastIndexOf(':') + 1))
    const address = local.slice(0, local.lastIndexOf(':')) || '*'
    if (!Number.isFinite(port)) continue

    // users:(("next-server",pid=1234,fd=21))  – several entries per line
    for (const m of line.matchAll(/\("([^"]+)",pid=(\d+)/g)) {
      const pid = Number(m[2])
      const entry = byPid.get(pid) ?? { name: m[1], ports: new Set(), addresses: new Set() }
      entry.ports.add(port)
      entry.addresses.add(address)
      byPid.set(pid, entry)
    }
  }

  const ourUid = process.getuid?.() ?? -1
  const ourPid = process.pid
  const ourPpid = process.ppid

  const servers: ServerProcess[] = []
  for (const [pid, entry] of byPid) {
    const [{ command, uid }, uptime] = await Promise.all([inspect(pid), uptimeOf(pid)])
    servers.push({
      pid,
      name: entry.name,
      ports: [...entry.ports].sort((a, b) => a - b),
      addresses: [...entry.addresses],
      command: command.slice(0, 300),
      uptime,
      self: pid === ourPid,
      protected: pid === ourPid || pid === ourPpid || pid === 1 || uid !== ourUid,
    })
  }

  servers.sort((a, b) => (a.ports[0] ?? 0) - (b.ports[0] ?? 0))
  return NextResponse.json({ servers, self: ourPid })
}

export async function DELETE(req: Request) {
  if (!isLocal(req)) {
    return NextResponse.json({ error: 'local requests only' }, { status: 403 })
  }

  const pid = Number(new URL(req.url).searchParams.get('pid'))
  if (!Number.isInteger(pid) || pid <= 1) {
    return NextResponse.json({ error: 'a valid pid is required' }, { status: 400 })
  }
  if (pid === process.pid || pid === process.ppid) {
    return NextResponse.json(
      { error: 'refusing to stop the server serving this page' }, { status: 400 })
  }

  const { uid } = await inspect(pid)
  const ourUid = process.getuid?.() ?? -1
  if (uid !== ourUid) {
    return NextResponse.json(
      { error: 'that process belongs to another user' }, { status: 403 })
  }

  try {
    process.kill(pid, 'SIGTERM')
  } catch (err) {
    return NextResponse.json(
      { error: `could not signal ${pid}: ${(err as Error).message}` }, { status: 500 })
  }

  // Give it a moment to exit cleanly before insisting.
  await new Promise((r) => setTimeout(r, 700))
  let escalated = false
  try {
    process.kill(pid, 0)          // still alive?
    process.kill(pid, 'SIGKILL')
    escalated = true
  } catch {
    /* already gone, which is the good case */
  }

  return NextResponse.json({ ok: true, pid, escalated })
}
