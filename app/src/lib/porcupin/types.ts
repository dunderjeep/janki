/** Shapes shared by the Porcupin routes and its client components. */

export type GraphName = 'focus' | 'quilt'

export type PinLink = { graph: GraphName; nodeId: string; label: string }

export type PinView = {
  id: string
  filename: string
  sizeBytes: number
  width: number | null
  height: number | null
  title: string | null
  description: string | null
  sourceUrl: string | null
  createdAt: string
  boardIds: string[]
  links: PinLink[]
}

export type BoardView = { id: string; name: string }

export type LinkedPin = Pick<PinView, 'id' | 'title' | 'filename'>

export const GRAPH_NAMES: Record<GraphName, string> = { focus: 'Focus', quilt: 'Quilt' }

/** The two canvases both take ?focus=<node id> and centre on that node. */
export function nodeHref(link: Pick<PinLink, 'graph' | 'nodeId'>): string {
  const base = link.graph === 'focus' ? '/quilt/org' : '/quilt'
  return `${base}?focus=${encodeURIComponent(link.nodeId)}`
}

/**
 * The video a link points to, or null. A pin is a video simply by having one of
 * these as its source; the stored image is the video's thumbnail.
 */
export function youtubeId(link: string | null): string | null {
  if (!link) return null
  let url: URL
  try {
    url = new URL(link)
  } catch {
    return null
  }
  const host = url.hostname.replace(/^(www|m|music)\./, '')
  const parts = url.pathname.split('/').filter(Boolean)
  let id: string | null | undefined
  if (host === 'youtu.be') id = parts[0]
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id = parts[0] === 'watch' ? url.searchParams.get('v') : ['shorts', 'embed', 'live', 'v'].includes(parts[0]) ? parts[1] : null
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null
}

export function imageSrc(pinId: string, size: 'thumb' | 'full'): string {
  return `/api/porcupin/pins/${encodeURIComponent(pinId)}/image${size === 'thumb' ? '?size=thumb&v=2' : ''}`
}
