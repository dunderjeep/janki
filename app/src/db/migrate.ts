/**
 * Programmatic migration runner — used by the `db:migrate` npm script.
 *
 * Run via:
 *   npm run db:migrate
 * which expands to:
 *   dotenv -e .env.local -- tsx src/db/migrate.ts
 */
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })

  const db = drizzle(pool)

  console.log('⏳ Running migrations…')
  await migrate(db, { migrationsFolder: './src/db/migrations' })
  console.log('✅ Migrations complete.')

  await pool.end()
}

main().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
