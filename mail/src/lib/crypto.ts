/** Mailbox passwords at rest: AES-256-GCM with the host's key, as "v1:iv:tag:ciphertext" in base64. */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { mailHost } from '../host'

const key = () => {
  const k = mailHost().secretKey()
  if (k.length !== 32) throw new Error('Mail needs a 32-byte secret key')
  return k
}

export function seal(plain: string): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key(), iv)
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), body.toString('base64')].join(':')
}

export function unseal(sealed: string): string {
  const [v, iv, tag, body] = sealed.split(':')
  if (v !== 'v1') throw new Error('Unknown secret format')
  const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'))
  d.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([d.update(Buffer.from(body, 'base64')), d.final()]).toString('utf8')
}
