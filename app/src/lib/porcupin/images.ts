/**
 * Porcupin's image files. They go to their own MinIO bucket, which has no
 * anonymous read policy: the only way to see one is through
 * /api/porcupin/pins/[id]/image, which checks the owner first.
 */
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3'
import { nanoid } from 'nanoid'
import sharp from 'sharp'
import { s3 } from '@/lib/storage'

const BUCKET = process.env.PORCUPIN_BUCKET ?? 'porcupin-images'

export const MAX_IMAGE_BYTES = 40 * 1024 * 1024

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

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/avif': '.avif',
}

/**
 * The image type the bytes actually are, or null.
 *
 * Read from the file rather than taken from the upload's Content-Type, because
 * that value is what the image route later serves it as.
 */
export function sniffImageType(b: Buffer): string | null {
  const ascii = (from: number, to: number) => b.subarray(from, to).toString('latin1')
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (ascii(0, 4) === 'GIF8') return 'image/gif'
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp'
  if (ascii(4, 8) === 'ftyp' && ['avif', 'avis'].includes(ascii(8, 12))) return 'image/avif'
  return null
}

export const THUMB_WIDTH = 640

/**
 * The board's small copy, made here from the stored bytes: a JPEG 640 wide,
 * turned upright, transparency on white. It used to come from the browser's
 * canvas, but a browser can hand back noise from a canvas (a GPU fault or an
 * anti-fingerprinting setting), and then the thumbnail is stripes. Also its
 * upright size, which is what the board lays out by. Null if sharp cannot read it.
 */
export async function makeThumb(bytes: Buffer): Promise<{ thumb: Buffer; width: number; height: number } | null> {
  try {
    const { data, info } = await sharp(bytes, { animated: false, limitInputPixels: 268_402_689 })
      .rotate()
      .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer({ resolveWithObject: true })
    const meta = await sharp(bytes).metadata()
    const upright = (meta.orientation ?? 1) >= 5
    const width = (upright ? meta.height : meta.width) ?? info.width
    const height = (upright ? meta.width : meta.height) ?? info.height
    return { thumb: data, width, height }
  } catch {
    return null
  }
}

export async function putImage(uid: string, bytes: Buffer, contentType: string): Promise<string> {
  await ensureBucket()
  const key = `${uid}/${nanoid()}${EXTENSIONS[contentType] ?? ''}`
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: bytes, ContentType: contentType }))
  return key
}

export async function deleteImages(keys: (string | null)[]): Promise<void> {
  await Promise.all(
    keys.flatMap((key) =>
      key ? [s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key })).catch(() => {})] : [],
    ),
  )
}

export async function openImage(key: string) {
  const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }))
  return { stream: obj.Body!.transformToWebStream(), length: obj.ContentLength }
}
