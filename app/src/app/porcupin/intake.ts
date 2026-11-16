/** Turning whatever was dropped or pasted into uploads. Browser-only. */
import { youtubeId, type PinView } from '@/lib/porcupin/types'

export type UploadResult = { pin: PinView; duplicate: boolean }

const THUMB_WIDTH = 640

async function readJson<T>(res: Response): Promise<T> {
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`)
  return json as T
}

export const api = <T,>(url: string, init?: RequestInit): Promise<T> => fetch(url, init).then((r) => readJson<T>(r))

export const jsonBody = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

const STORABLE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif']
const MAX_CONVERTED_SIDE = 4096

function draw(bitmap: ImageBitmap, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return canvas
}

const toJpeg = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))

/**
 * Its dimensions and a small JPEG for the board, plus a full-size JPEG when the
 * format is one the board does not store. That is how an iPhone's HEIC photo
 * gets in: Safari can decode it even though most browsers cannot.
 */
async function measure(file: Blob): Promise<{ width: number; height: number; thumb: Blob | null; converted: Blob | null }> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('this browser cannot read that image')
  }
  const { width, height } = bitmap
  const scale = Math.min(1, THUMB_WIDTH / width)
  const thumb = await toJpeg(draw(bitmap, width * scale, height * scale), 0.82)
  let converted: Blob | null = null
  if (!STORABLE_TYPES.includes(file.type)) {
    const fit = Math.min(1, MAX_CONVERTED_SIDE / Math.max(width, height))
    converted = await toJpeg(draw(bitmap, width * fit, height * fit), 0.9)
  }
  bitmap.close()
  return { width, height, thumb, converted }
}

export async function uploadFile(
  file: File,
  boardId: string | null,
  sourceUrl: string | null,
  title?: string,
): Promise<UploadResult> {
  const { width, height, thumb, converted } = await measure(file)
  const form = new FormData()
  if (converted) form.set('image', converted, `${file.name.replace(/\.[^.]*$/, '')}.jpg`)
  else form.set('image', file)
  if (thumb) form.set('thumb', thumb, 'thumb.jpg')
  form.set('width', String(width))
  form.set('height', String(height))
  if (boardId) form.set('boardId', boardId)
  if (sourceUrl) form.set('sourceUrl', sourceUrl)
  if (title) form.set('title', title)
  return api<UploadResult>('/api/porcupin/pins', { method: 'POST', body: form })
}

export async function uploadUrl(url: string, boardId: string | null): Promise<UploadResult> {
  if (url.startsWith('data:')) {
    const blob = await (await fetch(url)).blob()
    return uploadFile(new File([blob], `pasted.${blob.type.split('/')[1] ?? 'png'}`, { type: blob.type }), boardId, null)
  }
  const res = await fetch('/api/porcupin/fetch', jsonBody('POST', { url }))
  if (!res.ok) await readJson(res)
  const name = decodeURIComponent(res.headers.get('X-Porcupin-Filename') ?? 'image')
  const title = res.headers.get('X-Porcupin-Title')
  const blob = await res.blob()
  return uploadFile(new File([blob], name, { type: blob.type }), boardId, url, title ? decodeURIComponent(title) : undefined)
}

function webUrls(text: string): string[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
  return lines.every((l) => /^https?:\/\/\S+$/i.test(l)) ? lines : []
}

function firstImageSrc(html: string): string | null {
  if (!html) return null
  return new DOMParser().parseFromString(html, 'text/html').querySelector('img')?.getAttribute('src') ?? null
}

export type Intake = { files: File[]; urls: string[]; source: string | null; rejected: number }

/**
 * What a drop or a paste carries, read in order of how directly it is the image:
 * the file itself, then the picture in the dragged HTML (which, for an image
 * inside a link, is what you meant rather than the link), then a bare URL.
 * A YouTube link comes before all of those: dragging a video off YouTube also
 * carries its thumbnail, and the video is what was meant.
 */
export function readTransfer(data: DataTransfer): Intake {
  const all = Array.from(data.files)
  const files = all.filter((f) => f.type.startsWith('image/'))
  const src = firstImageSrc(data.getData('text/html'))
  const listed = webUrls(data.getData('text/uri-list'))
  const urls = listed.length > 0 ? listed : webUrls(data.getData('text/plain'))
  const webSrc = src && webUrls(src).length === 1 ? src : null

  const videos = urls.filter((u) => youtubeId(u))
  if (videos.length > 0) return { files: [], urls: videos, source: null, rejected: 0 }

  if (files.length > 0) {
    return { files, urls: [], source: files.length === 1 ? (webSrc ?? urls[0] ?? null) : null, rejected: all.length - files.length }
  }
  if (all.length > 0) return { files: [], urls: [], source: null, rejected: all.length }
  if (webSrc || src?.startsWith('data:image/')) return { files: [], urls: [src!], source: null, rejected: 0 }
  return { files: [], urls, source: null, rejected: 0 }
}
