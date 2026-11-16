/**
 * Remakes every Porcupin thumbnail on the server from the stored photo, and
 * puts back each pin's upright width and height. For thumbnails a browser's
 * canvas spoiled (they came out as stripes) before the server made its own.
 *
 *   npx dotenv -e .env.local -- tsx scripts/rethumb-pins.ts
 */
import { GetObjectCommand } from '@aws-sdk/client-s3'
import pg from 'pg'
import { s3 } from '@/lib/storage'
import { deleteImages, makeThumb, putImage } from '@/lib/porcupin/images'

const BUCKET = process.env.PORCUPIN_BUCKET ?? 'porcupin-images'

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  const { rows } = await pool.query<{ id: string; owner_uid: string; storage_key: string; thumb_key: string | null }>(
    'SELECT id, owner_uid, storage_key, thumb_key FROM porcupin.pins ORDER BY created_at',
  )
  let done = 0
  for (const pin of rows) {
    const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: pin.storage_key }))
    const made = await makeThumb(Buffer.from(await obj.Body!.transformToByteArray()))
    if (!made) {
      console.log(`skipped ${pin.id}: sharp cannot read it`)
      continue
    }
    const key = await putImage(pin.owner_uid, made.thumb, 'image/jpeg')
    await pool.query('UPDATE porcupin.pins SET thumb_key = $2, width = $3, height = $4 WHERE id = $1', [pin.id, key, made.width, made.height])
    await deleteImages([pin.thumb_key])
    done++
  }
  console.log(`remade ${done} of ${rows.length} thumbnails`)
  await pool.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
