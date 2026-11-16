/**
 * The notes' blob store in janki: MinIO, bucket NOTES_BUCKET (default
 * notes-blobs), one object per owner and content ID, `<did>/<cid>`. The bucket
 * has no anonymous read; files are served by /api/gtd/blob/<cid>, which only
 * ever reads the signed-in person's own prefix.
 */
import { CreateBucketCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import type { BlobStore } from 'notes/server'
import { s3 } from '@/lib/storage'

const BUCKET = process.env.NOTES_BUCKET ?? 'notes-blobs'

let ready: Promise<void> | null = null
function ensureBucket(): Promise<void> {
  ready ??= s3.send(new HeadBucketCommand({ Bucket: BUCKET }))
    .then(() => undefined)
    .catch(async () => { await s3.send(new CreateBucketCommand({ Bucket: BUCKET })) })
    .catch((err) => { ready = null; throw err })
  return ready
}

const key = (did: string, cid: string) => `${did}/${cid}`

export const minioBlobs: BlobStore = {
  async put(did, cid, bytes, mimeType) {
    await ensureBucket()
    await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key(did, cid), Body: bytes, ContentType: mimeType }))
  },
  async get(did, cid) {
    try {
      const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key(did, cid) }))
      return { bytes: await obj.Body!.transformToByteArray(), mimeType: obj.ContentType ?? 'application/octet-stream' }
    } catch (err) {
      if ((err as { name?: string }).name === 'NoSuchKey') return null
      throw err
    }
  },
  async delete(did, cid) {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key(did, cid) })).catch(() => {})
  },
}
