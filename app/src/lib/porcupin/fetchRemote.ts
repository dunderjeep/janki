/**
 * Fetch an image the person pointed at with a link.
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
import { MAX_IMAGE_BYTES, sniffImageType } from './images'
import { PorcupinError } from './store'
import { youtubeId } from './types'

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
      return callback(new PorcupinError(NOT_PUBLIC), '', 0)
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
    throw new PorcupinError('That is not a valid link')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new PorcupinError('Only http and https links can be added')
  // A literal IP never reaches the lookup above.
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (net.isIP(host) && isBlocked(host)) throw new PorcupinError(NOT_PUBLIC)
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
        // Plenty of image hosts refuse a request with no browser-like headers.
        headers: {
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36',
          Accept: 'image/avif,image/webp,image/png,image/*,text/html;q=0.8,*/*;q=0.5',
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
        const limit = contentType.includes('html') ? MAX_HTML_BYTES : MAX_IMAGE_BYTES
        const chunks: Buffer[] = []
        let size = 0
        res.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > limit) {
            // A web page past the limit is still useful: og:image sits in <head>.
            if (limit === MAX_HTML_BYTES) {
              res.destroy()
              return resolve({ status, contentType, body: Buffer.concat(chunks) })
            }
            req.destroy(new PorcupinError('That image is larger than 40 MB'))
            return
          }
          chunks.push(chunk)
        })
        res.on('end', () => resolve({ status, contentType, body: Buffer.concat(chunks) }))
        res.on('error', reject)
      },
    )
    req.setTimeout(TIMEOUT_MS, () => req.destroy(new PorcupinError('That site took too long to answer', 504)))
    req.on('error', reject)
    req.end()
  })
}

async function follow(start: URL): Promise<Response & { url: URL }> {
  let url = start
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await request(url)
    if (res.status < 300 || res.status >= 400) {
      if (res.status !== 200) throw new PorcupinError(`That site answered ${res.status}`, 502)
      return { ...res, url }
    }
    if (!res.location) throw new PorcupinError('That site sent a redirect to nowhere', 502)
    url = parseWebUrl(res.location, url)
  }
  throw new PorcupinError('That link redirects too many times', 502)
}

/** The picture a web page says represents it. */
function pagePreviewImage(html: string): string | null {
  const head = html.slice(0, MAX_HTML_BYTES)
  for (const tag of head.match(/<meta\b[^>]*>/gi) ?? []) {
    const name = /\b(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase()
    if (name !== 'og:image' && name !== 'og:image:url' && name !== 'twitter:image') continue
    const content = /\bcontent\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]
    if (content) return content.replace(/&amp;/g, '&')
  }
  return null
}

function filenameFrom(url: URL, contentType: string): string {
  const last = url.pathname.split('/').filter(Boolean).pop() ?? ''
  let name = last
  try {
    name = decodeURIComponent(last)
  } catch {}
  name = name.replace(/[^\p{L}\p{N}._ -]/gu, '').slice(0, 120)
  return name.includes('.') ? name : `${name || url.hostname}.${contentType.split('/')[1]}`
}

export type RemoteImage = { bytes: Buffer; contentType: string; filename: string; title?: string }

/** Not every video has a full-size thumbnail; those that lack one answer 404. */
async function fetchYoutubeThumbnail(id: string): Promise<RemoteImage> {
  const thumbnail = (size: string) => follow(new URL(`https://i.ytimg.com/vi/${id}/${size}.jpg`))
  const res = await thumbnail('maxresdefault').catch(() => thumbnail('hqdefault'))
  const type = sniffImageType(res.body)
  if (!type) throw new PorcupinError('YouTube sent no thumbnail for that video', 502)
  return { bytes: res.body, contentType: type, filename: `youtube-${id}.jpg`, title: await youtubeTitle(id) }
}

/** The title only saves typing, so a video without one still gets pinned. */
async function youtubeTitle(id: string): Promise<string | undefined> {
  const watch = encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)
  try {
    const res = await follow(new URL(`https://www.youtube.com/oembed?format=json&url=${watch}`))
    return String(JSON.parse(res.body.toString('utf8')).title ?? '') || undefined
  } catch {
    return undefined
  }
}

/**
 * The image at a link. A link to a web page yields that page's preview image,
 * which is what dragging a link off an article or a product page means.
 */
export async function fetchRemoteImage(raw: string): Promise<RemoteImage> {
  const video = youtubeId(raw)
  if (video) return fetchYoutubeThumbnail(video)

  let res = await follow(parseWebUrl(raw))
  let type = sniffImageType(res.body)

  if (!type && res.contentType.includes('html')) {
    const preview = pagePreviewImage(res.body.toString('utf8'))
    if (!preview) throw new PorcupinError('That page has no preview image. Try dragging the picture itself', 422)
    res = await follow(parseWebUrl(preview, res.url))
    type = sniffImageType(res.body)
  }
  if (!type) throw new PorcupinError('That link is not a JPEG, PNG, GIF, WebP or AVIF image', 415)
  return { bytes: res.body, contentType: type, filename: filenameFrom(res.url, type) }
}

/** A web page's HTML, under the same public-addresses-only rule as images. */
export async function fetchPublicPage(raw: string): Promise<string> {
  const res = await follow(parseWebUrl(raw))
  return res.body.toString('utf8')
}
