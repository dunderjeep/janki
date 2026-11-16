/**
 * Content IDs for blobs, as ATProto makes them: CIDv1, the raw codec, a
 * SHA-256 multihash, written in base32 (they start "bafkrei").
 * https://atproto.com/specs/blob
 */
import { createHash } from 'node:crypto'

const B32 = 'abcdefghijklmnopqrstuvwxyz234567'

function base32(bytes: Uint8Array): string {
  let out = ''
  let bits = 0
  let value = 0
  for (const b of bytes) {
    value = (value << 8) | b
    bits += 8
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31]
  return out
}

export const CID = /^bafkrei[a-z2-7]{52}$/

export function blobCid(bytes: Uint8Array): string {
  const digest = createHash('sha256').update(bytes).digest()
  // version 1, raw (0x55), sha2-256 (0x12), 32 bytes
  return 'b' + base32(Uint8Array.from([0x01, 0x55, 0x12, 0x20, ...digest]))
}
