# Joblowski

Job search, alerts, an application tracker and honest résumé drafting, on your own computer.

> Work in progress. A fuller README (design notes, screenshots) comes before the first public release.

## Run it

Needs Node 20 or later.

```bash
npm install
npm run dev        # http://127.0.0.1:3210
```

Or build and run it properly:

```bash
npm run build
npm start
```

There is no sign-in. Joblowski only listens on `127.0.0.1`, so only this computer can reach it.

## Settings

Set these in `.env.local`, all optional:

| Variable | What it does |
|---|---|
| `ANTHROPIC_API_KEY` | Turns on drafting and revising résumés and letters with Claude. Without it, everything else works. |
| `JOBLOWSKI_DATA_DIR` | Where the database is kept. Default: `~/.joblowski`. |
| `JOBLOWSKI_ALERTS` | `off` stops the saved-search alerts from running in the background. |
| `CHROME_PATH` | Chrome or Chromium, used for PDF export. Default: `/usr/bin/google-chrome`. |

## How it is built

- **Database: [PGlite](https://pglite.dev).** It is real Postgres compiled to WebAssembly and kept in a folder, so there is nothing else to install. On start-up, `standalone/host.ts` applies any `migrations/*.sql` not applied yet.
- **Embedding.** The same code also runs inside a larger app. `src/` has no idea which host it is in. A host calls `setJoblowskiHost({ db, userId })`, mounts `joblowski/api` at `/api/joblowski/[...path]`, and renders the `joblowski/ui` components.
