export async function resolveBlueskyPds(
  handle: string
): Promise<{ did: string; pdsUrl: string } | null> {
  const resolveRes = await fetch(
    `https://bsky.social/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`,
    { cache: 'no-store' }
  )
  if (!resolveRes.ok) return null
  const { did } = (await resolveRes.json()) as { did: string }

  let pdsUrl = 'https://bsky.social'
  if (did.startsWith('did:plc:')) {
    const didDocRes = await fetch(`https://plc.directory/${did}`)
    if (didDocRes.ok) {
      const didDoc = (await didDocRes.json()) as {
        service?: Array<{ type: string; serviceEndpoint: string }>
      }
      const pds = didDoc.service?.find((s) => s.type === 'AtprotoPersonalDataServer')
      if (pds?.serviceEndpoint) pdsUrl = pds.serviceEndpoint
    }
  }
  return { did, pdsUrl }
}

export async function authenticateBluesky(
  handle: string,
  appPassword: string
): Promise<{ did: string; handle: string } | null> {
  const resolved = await resolveBlueskyPds(handle)
  if (!resolved) return null
  const { did, pdsUrl } = resolved

  const res = await fetch(`${pdsUrl}/xrpc/com.atproto.server.createSession`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: handle, password: appPassword }),
  })
  if (!res.ok) return null
  const session = (await res.json()) as { did: string; handle: string }
  return { did: session.did ?? did, handle: session.handle }
}
