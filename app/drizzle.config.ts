import { defineConfig } from 'drizzle-kit'

// drizzle-kit doesn't auto-load .env.local — run via dotenv-cli in npm scripts.
export default defineConfig({
  dialect: 'postgresql',
  schema: ['./src/db/schema/auth.ts', './src/db/schema/janki.ts', './src/db/schema/banki.ts'],
  out: './src/db/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: false,
})
