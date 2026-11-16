/**
 * PDF export, using the Chrome already on the machine. It produces real,
 * selectable text, which applicant tracking systems need in order to read a
 * résumé at all, and matches the on-screen preview because it is the same page.
 */
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { JoblowskiError } from './store'

const CHROME = process.env.CHROME_PATH ?? '/usr/bin/google-chrome'
const TIMEOUT_MS = 45_000

// One at a time: Chrome runs inside janki's memory ceiling (see janki.service).
let queue: Promise<unknown> = Promise.resolve()

function print(html: string): Promise<Buffer> {
  return (async () => {
    const dir = await mkdtemp('/tmp/joblowski-pdf-')
    try {
      const page = path.join(dir, 'page.html')
      const output = path.join(dir, 'out.pdf')
      await writeFile(page, html)
      await new Promise<void>((resolve, reject) => {
        execFile(
          CHROME,
          [
            '--headless=new',
            '--disable-gpu',
            '--disable-dev-shm-usage',
            '--disable-extensions',
            '--no-first-run',
            '--no-pdf-header-footer',
            // Scripts stay enabled because print-to-pdf writes nothing without
            // them; render.ts has already escaped any a document contained.
            '--host-resolver-rules=MAP * ~NOTFOUND',
            `--user-data-dir=${path.join(dir, 'profile')}`,
            `--print-to-pdf=${output}`,
            `file://${page}`,
          ],
          { timeout: TIMEOUT_MS, killSignal: 'SIGKILL' },
          (err) => (err ? reject(err) : resolve()),
        )
      })
      return await readFile(output)
    } catch (err) {
      console.error('[joblowski] pdf:', err)
      throw new JoblowskiError('The PDF could not be made', 500)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })()
}

export function htmlToPdf(html: string): Promise<Buffer> {
  const job = queue.then(() => print(html))
  queue = job.catch(() => undefined)
  return job
}

export function pdfResponse(pdf: Buffer, name: string): Response {
  const ascii = name.replace(/[^\w .-]+/g, '_').trim() || 'document'
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${ascii}.pdf"; filename*=UTF-8''${encodeURIComponent(name)}.pdf`,
      'Cache-Control': 'private, no-store',
    },
  })
}
