/**
 * Fetch a job ad's web page so Claude can read it.
 *
 * The server makes this request from inside the machine, where MinIO, Postgres
 * and everything else on localhost and the tailnet would answer it. So every
 * connection is checked at the point of DNS resolution, including each redirect:
 * checking the URL up front would be undone by a host that resolves differently
 * a moment later.
 */
import dns from 'node:dns'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import { JoblowskiError } from './errors'

const MAX_HTML_BYTES = 2 * 1024 * 1024
const MAX_REDIRECTS = 5
const TIMEOUT_MS = 20_000

const blocked = new net.BlockList()
for (const [addr, bits] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 3],
] as const) blocked.addSubnet(addr, bits, 'ipv4')
for (const [addr, bits] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]] as const) {
  blocked.addSubnet(addr, bits, 'ipv6')
}

const NOT_PUBLIC = 'That address is not on the public internet'

function isBlocked(address: string): boolean {
  const family = net.isIP(address)
  return family === 0 || blocked.check(address, family === 6 ? 'ipv6' : 'ipv4')
}

const publicOnlyLookup: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, '', 0)
    if (addresses.length === 0 || addresses.some((a) => isBlocked(a.address))) {
      return callback(new JoblowskiError(NOT_PUBLIC), '', 0)
    }
    if (options.all) return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, addresses)
    callback(null, addresses[0].address, addresses[0].family)
  })
}

function parseWebUrl(raw: string, base?: URL): URL {
  let url: URL
  try {
    url = new URL(raw, base)
  } catch {
    throw new JoblowskiError('That is not a valid link')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new JoblowskiError('Only http and https links can be added')
  // A literal IP never reaches the lookup above.
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (net.isIP(host) && isBlocked(host)) throw new JoblowskiError(NOT_PUBLIC)
  return url
}

type Response = { status: number; location?: string; contentType: string; body: Buffer }

function request(url: URL): Promise<Response> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http
    const req = client.request(
      url,
      {
        lookup: publicOnlyLookup,
        // Plenty of sites refuse a request with no browser-like headers.
        headers: {
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
          Referer: `${url.origin}/`,
        },
      },
      (res) => {
        const contentType = (res.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()
        const status = res.statusCode ?? 0
        if (status >= 300 && status < 400) {
          res.destroy()
          return resolve({ status, location: res.headers.location, contentType, body: Buffer.alloc(0) })
        }
        const chunks: Buffer[] = []
        let size = 0
        res.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > MAX_HTML_BYTES) {
            // Keep what came: an ad's text is near the top.
            res.destroy()
            return resolve({ status, contentType, body: Buffer.concat(chunks) })
          }
          chunks.push(chunk)
        })
        res.on('end', () => resolve({ status, contentType, body: Buffer.concat(chunks) }))
        res.on('error', reject)
      },
    )
    req.setTimeout(TIMEOUT_MS, () => req.destroy(new JoblowskiError('That site took too long to answer', 504)))
    req.on('error', reject)
    req.end()
  })
}

async function follow(start: URL): Promise<Response & { url: URL }> {
  let url = start
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await request(url)
    if (res.status < 300 || res.status >= 400) {
      if (res.status !== 200) throw new JoblowskiError(`That site answered ${res.status}`, 502)
      return { ...res, url }
    }
    if (!res.location) throw new JoblowskiError('That site sent a redirect to nowhere', 502)
    url = parseWebUrl(res.location, url)
  }
  throw new JoblowskiError('That link redirects too many times', 502)
}

/** A web page's HTML, from public addresses only. */
export async function fetchPublicPage(raw: string): Promise<string> {
  const res = await follow(parseWebUrl(raw))
  return res.body.toString('utf8')
}
