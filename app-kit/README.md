# @janki/app-kit

The contract between a janki app and whatever runs it. The same app runs in
two places:

- **Inside a shell** (janki): the shell's Postgres and its signed-in user.
- **On its own**: one person, PGlite on disk, no sign-in, listening on 127.0.0.1.

## The host

Every app declares one host slot:

```ts
// myapp/src/host.ts
import { defineHost, type BaseHost } from '@janki/app-kit/host'

export type MyAppHost = BaseHost & {
  /** Optional slots: things a shell may offer. Leave one out and the app drops that feature. */
  recipes?: RecipeSource
}

const slot = defineHost<MyAppHost>('MyApp')
export const setMyAppHost = slot.setHost
export const myAppHost = slot.host
export const db = slot.db // a lazy proxy, safe to import before the host is set
```

`BaseHost` is `{ db, userId }`: a Drizzle database holding the app's own
Postgres schema, and who is asking (null if nobody is signed in).

## The rules

1. **An app owns one Postgres schema**, named after it, with its own
   `migrations/*.sql`. It never reads another app's tables.
2. **An app never imports another app, or the shell.** Anything it wants
   from outside goes in an optional slot on its host type.
3. **The shell's adapter fills the slots.** It is the only code that knows
   two apps at once. janki's adapter for NutriLabel, for example, turns
   Kitchen recipes into NutriLabel's `RecipeSource`.

## Running alone

```ts
// myapp/standalone/host.ts
import { openLocal } from '@janki/app-kit/standalone'

const local = openLocal({ app: 'myapp', dataDir, migrationsDir })
export const ready = local.ready
setMyAppHost({ db: local.db, userId: local.userId })
```

`openLocal` opens the PGlite database once per process. It applies any
migrations not yet recorded in `myapp_meta.migrations` and makes every row
belong to `LOCAL_USER`. List `@electric-sql/pglite` in
`serverExternalPackages`, and `@janki/app-kit` in `transpilePackages`.
