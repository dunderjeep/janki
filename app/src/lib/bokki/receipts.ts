/**
 * Receipt files. They go to their own MinIO bucket, which — unlike janki-media —
 * has no anonymous read policy: the only way to see one is through
 * /api/bokki/receipts/[id], which checks the owner first.
 */
import { createHash } from 'node:crypto'
import path from 'node:path'
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3'
import { nanoid } from 'nanoid'
import { s3 } from '@/lib/storage'

const BUCKET = process.env.BOKKI_RECEIPTS_BUCKET ?? 'bokki-receipts'

export const MAX_RECEIPT_BYTES = 20 * 1024 * 1024
export const RECEIPT_TYPES = /^(image\/(jpeg|png|webp|heic|heif|gif)|application\/pdf)$/

let bucketReady: Promise<void> | null = null

function ensureBucket(): Promise<void> {
  bucketReady ??= s3
    .send(new HeadBucketCommand({ Bucket: BUCKET }))
    .then(() => undefined)
    .catch(async () => {
      await s3.send(new CreateBucketCommand({ Bucket: BUCKET }))
    })
    .catch((err) => {
      bucketReady = null
      throw err
    })
  return bucketReady
}

/**
 * Duck-typed: Node 18 has no global `File`, so `instanceof File` throws.
 */
export type UploadedFile = { name: string; type: string; size: number; arrayBuffer(): Promise<ArrayBuffer> }

export function isUploadedFile(v: unknown): v is UploadedFile {
  return typeof v === 'object' && v !== null && typeof (v as UploadedFile).arrayBuffer === 'function'
}

/** The non-empty files sent under `receipt`. */
export function receiptFiles(form: FormData): UploadedFile[] {
  return form.getAll('receipt').filter((v): v is FormDataEntryValue & UploadedFile => isUploadedFile(v) && v.size > 0)
}

export type StoredReceipt = {
  storageKey: string
  filename: string
  contentType: string
  sizeBytes: number
  sha256: string
}

/** Check every file first, then store them all — so a bad third file stores nothing. */
export async function storeReceipts(uid: string, files: UploadedFile[]): Promise<StoredReceipt[]> {
  for (const f of files) {
    if (!RECEIPT_TYPES.test(f.type)) throw new Error(`${f.name}: ${f.type || 'unknown type'} — receipts must be an image or a PDF`)
    if (f.size > MAX_RECEIPT_BYTES) throw new Error(`${f.name}: larger than 20 MB`)
  }
  if (files.length === 0) return []
  await ensureBucket()

  const stored: StoredReceipt[] = []
  try {
    for (const f of files) {
      const bytes = Buffer.from(await f.arrayBuffer())
      const storageKey = `${uid}/${nanoid()}${path.extname(f.name).toLowerCase()}`
      await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: storageKey, Body: bytes, ContentType: f.type }))
      stored.push({
        storageKey,
        filename: f.name,
        contentType: f.type,
        sizeBytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      })
    }
  } catch (err) {
    await discardReceipts(stored)
    throw err
  }
  return stored
}

/** Only for files whose database rows were never committed. */
export async function discardReceipts(stored: StoredReceipt[]): Promise<void> {
  await Promise.all(
    stored.map((s) => s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: s.storageKey })).catch(() => {})),
  )
}

export async function readReceipt(storageKey: string) {
  const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: storageKey }))
  return obj.Body!.transformToByteArray()
}
