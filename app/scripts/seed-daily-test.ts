/**
 * Seeds a throwaway identity for the browser tests: a routine template and a
 * linkable note (the Daily page), and a small task list with a loose task, a
 * list (Bills) and a project (Garden) for Next.
 *
 *   npx tsx scripts/seed-daily-test.ts did:plc:…
 */
import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import { createNote, setNotesHost, type NotesDb } from 'notes/server'

async function main() {
  const did = process.argv[2]
  if (!did?.startsWith('did:plc:jankinotestest')) throw new Error('Only for throwaway test identities')
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  setNotesHost({ db: drizzle(pool) as unknown as NotesDb, userId: async () => did })
  await createNote(did, 'Templates/routine.org', '* TODO Rutine [0/2]\n- [ ] wake\n- [ ] breathe\n')
  await createNote(did, 'tasks.org', '#+title: tasks\n* TODO find dutch oven\n* Bills\n** TODO Pay rent\n* Garden\n** TODO Buy bulbs\n** TODO Plant them\nDig them 20 cm deep, near the fence.\n')
  await createNote(did, 'breathing.org', ':PROPERTIES:\n:ID: aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee\n:END:\n#+title: Breathing\n')
  await pool.end()
}

main().catch((e) => { console.error(e); process.exit(1) })
