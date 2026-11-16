/**
 * MinIO / S3-compatible object storage helpers.
 *
 * Env vars expected in .env.local:
 *   MINIO_ENDPOINT   = http://localhost:9002
 *   MINIO_ACCESS_KEY = minioadmin
 *   MINIO_SECRET_KEY = minioadmin
 *   MINIO_BUCKET     = janki-media
 */
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'
import { nanoid } from 'nanoid'
import path from 'path'

const ENDPOINT = process.env.MINIO_ENDPOINT ?? 'http://localhost:9002'
const BUCKET   = process.env.MINIO_BUCKET   ?? 'janki-media'

export const s3 = new S3Client({
  endpoint:        ENDPOINT,
  region:          'us-east-1',   // MinIO accepts any region value
  credentials: {
    accessKeyId:     process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
    secretAccessKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin',
  },
  forcePathStyle: true,           // Required for MinIO path-style URLs
})

// ── Extension mapping ─────────────────────────────────────────────────────────

const MIME_EXT: Record<string, string> = {
  'image/jpeg':  '.jpg',
  'image/jpg':   '.jpg',
  'image/png':   '.png',
  'image/gif':   '.gif',
  'image/webp':  '.webp',
  'image/avif':  '.avif',
  'audio/mpeg':  '.mp3',
  'audio/mp3':   '.mp3',
  'audio/mp4':   '.m4a',
  'audio/wav':   '.wav',
  'audio/ogg':   '.ogg',
  'audio/webm':  '.webm',
}

function extFor(filename: string, mimeType: string): string {
  const fromName = path.extname(filename)
  return fromName || MIME_EXT[mimeType] || ''
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface StoredMedia {
  url:  string   // Public URL to access the object
  key:  string   // Object key (used for deletion)
}

/**
 * Upload a Buffer to MinIO and return the public URL + object key.
 * `folder` is used as a prefix, e.g. "cards/abc123".
 */
export async function uploadMedia(
  buffer:      Buffer,
  filename:    string,
  mimeType:    string,
  folder = 'cards',
): Promise<StoredMedia> {
  const ext = extFor(filename, mimeType)
  const key = `${folder}/${nanoid()}${ext}`

  await s3.send(new PutObjectCommand({
    Bucket:      BUCKET,
    Key:         key,
    Body:        buffer,
    ContentType: mimeType,
  }))

  // MinIO path-style public URL
  const url = `${ENDPOINT}/${BUCKET}/${key}`
  return { url, key }
}

/**
 * Delete an object from MinIO by its key.
 * Silently ignores "not found" errors.
 */
export async function deleteMedia(key: string): Promise<void> {
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
  } catch {
    // Non-fatal — object may already be gone
  }
}
