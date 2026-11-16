/**
 * What hangs off one front's page: documents (contracts, registrations,
 * certificates…) and links to related places, in janki or on the web.
 *
 * Documents go to their own private MinIO bucket, like Bokki's receipts: the
 * only way to read one is /api/dough/documents/[id], which checks the owner.
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
import { sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '@/db'
import { s3 } from '@/lib/storage'
import { ChainError } from '@/lib/chains/store'
import { isUploadedFile, type UploadedFile } from '@/lib/bokki/receipts'

const BUCKET = process.env.DOUGH_DOCUMENTS_BUCKET ?? 'dough-documents'
const MAX_BYTES = 25 * 1024 * 1024
/** PDFs, images, office and plain-text files. */
const TYPES =
  /^(application\/pdf|image\/(jpeg|png|webp|gif|heic|heif)|text\/(plain|csv|markdown)|application\/(msword|vnd\.openxmlformats-officedocument\.[\w.]+|vnd\.oasis\.opendocument\.[\w.]+|vnd\.ms-excel|zip))$/

export type FrontDocument = {
  id: string
  filename: string
  contentType: string
  sizeBytes: number
  note: string
  createdAt: string
}

export type FrontLink = { id: string; label: string; url: string }

/** CHAIN_IDs are uuids; anything else is not a front. */
export function frontId(v: unknown): string {
  if (typeof v !== 'string' || !/^[\w-]{1,64}$/.test(v)) throw new ChainError('Unknown front', 400)
  return v
}

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

export async function listDocuments(uid: string, front: string): Promise<FrontDocument[]> {
  const { rows } = await db.execute<FrontDocument>(sql`
    select id, filename, content_type as "contentType", size_bytes as "sizeBytes", note,
           to_char(created_at at time zone 'Europe/Oslo', 'YYYY-MM-DD') as "createdAt"
      from dough.front_documents
     where owner_uid = ${uid} and front_id = ${front}
     order by created_at desc`)
  return rows
}

/** Checks every file first, so a bad third file stores nothing. */
export async function addDocuments(uid: string, front: string, form: FormData): Promise<FrontDocument[]> {
  const files = form.getAll('file').filter((v): v is FormDataEntryValue & UploadedFile => isUploadedFile(v) && v.size > 0)
  if (files.length === 0) throw new ChainError('Choose a file to attach')
  for (const f of files) {
    if (!TYPES.test(f.type)) throw new ChainError(`${f.name}: ${f.type || 'unknown type'} can't be attached. Use a PDF, image, office or text file.`)
    if (f.size > MAX_BYTES) throw new ChainError(`${f.name}: larger than 25 MB`)
  }
  const note = typeof form.get('note') === 'string' ? String(form.get('note')).trim().slice(0, 200) : ''
  await ensureBucket()

  const stored: string[] = []
  try {
    for (const f of files) {
      const bytes = Buffer.from(await f.arrayBuffer())
      const key = `${uid}/${front}/${nanoid()}${path.extname(f.name).toLowerCase()}`
      await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: bytes, ContentType: f.type }))
      stored.push(key)
      await db.execute(sql`
        insert into dough.front_documents (id, owner_uid, front_id, storage_key, filename, content_type, size_bytes, sha256, note)
        values (${nanoid()}, ${uid}, ${front}, ${key}, ${f.name}, ${f.type}, ${bytes.length},
                ${createHash('sha256').update(bytes).digest('hex')}, ${note})`)
    }
  } catch (err) {
    for (const Key of stored) {
      await db.execute(sql`delete from dough.front_documents where owner_uid = ${uid} and storage_key = ${Key}`).catch(() => {})
      await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key })).catch(() => {})
    }
    throw err
  }
  return listDocuments(uid, front)
}

export async function readDocument(uid: string, id: string) {
  const { rows } = await db.execute<{ storageKey: string; filename: string; contentType: string }>(sql`
    select storage_key as "storageKey", filename, content_type as "contentType"
      from dough.front_documents where id = ${id} and owner_uid = ${uid}`)
  const doc = rows[0]
  if (!doc) throw new ChainError('Not found', 404)
  const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: doc.storageKey }))
  return { ...doc, bytes: await obj.Body!.transformToByteArray() }
}

export async function deleteDocument(uid: string, id: string) {
  const { rows } = await db.execute<{ storageKey: string }>(sql`
    delete from dough.front_documents where id = ${id} and owner_uid = ${uid} returning storage_key as "storageKey"`)
  if (!rows[0]) throw new ChainError('Not found', 404)
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: rows[0].storageKey })).catch(() => {})
  return { ok: true }
}

const label = (v: unknown) => {
  const t = typeof v === 'string' ? v.trim() : ''
  if (!t) throw new ChainError('Give the link a name')
  if (t.length > 60) throw new ChainError('Keep the name under 60 characters')
  return t
}

/** A path inside janki (/bokki, /quilt?…) or an https address. */
const linkUrl = (v: unknown) => {
  const raw = typeof v === 'string' ? v.trim() : ''
  if (/^\/(?!\/)/.test(raw)) return raw
  let parsed: URL
  try {
    parsed = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`)
  } catch {
    throw new ChainError('That is not a web address or a janki path like /bokki')
  }
  if (parsed.protocol !== 'https:') throw new ChainError('Use an https:// address, or a janki path like /bokki')
  return parsed.toString()
}

export async function listFrontLinks(uid: string, front: string): Promise<FrontLink[]> {
  const { rows } = await db.execute<FrontLink>(sql`
    select id, label, url from dough.front_links
     where owner_uid = ${uid} and front_id = ${front} order by position, created_at`)
  return rows
}

export async function addFrontLink(uid: string, front: string, input: Record<string, unknown>): Promise<FrontLink> {
  const link = { id: nanoid(), label: label(input.label), url: linkUrl(input.url) }
  await db.execute(sql`
    insert into dough.front_links (id, owner_uid, front_id, label, url, position)
    values (${link.id}, ${uid}, ${front}, ${link.label}, ${link.url},
            (select coalesce(max(position), -1) + 1 from dough.front_links where owner_uid = ${uid} and front_id = ${front}))`)
  return link
}

export async function deleteFrontLink(uid: string, id: string) {
  const { rowCount } = await db.execute(sql`delete from dough.front_links where id = ${id} and owner_uid = ${uid}`)
  if (!rowCount) throw new ChainError('Not found', 404)
  return { ok: true }
}
