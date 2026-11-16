# janki

A personal operating system: one sign-in, one home screen, and a set of small
apps that share a database and know about each other. Notes, tasks, flashcards,
mail, money, photos and job hunting, all in one place you run yourself.

janki is a **shell** that apps plug into. Each app is its own package with its
own database schema, and several of them also run **on their own** with no
janki at all. Clone it, keep the apps you want, and write your own.

## The apps

| App | What it does |
|---|---|
| **Next** | Every next action across your projects, GTD-style: inbox, a two-minute "now" queue, snooze by day or time slot, someday/maybe, weekly review, a calendar for dated tasks. |
| **Focus** and **Daily** | Your notes in rings around today (this week, this month, this year, goals), and a daily journal with checklists and note links. Notes are stored org-mode style, as ATProto-shaped records. |
| **Quilt Graph** | A knowledge graph: typed nodes and labelled links, with layouts that stay where you put them. |
| **SRS** | Flashcards with FSRS scheduling, LaTeX, CSV import, and card drafting by Claude. |
| **Scatterbrain** | A Scrivener-like writing studio: documents and folders in a binder, word-count targets, and notes linked in. |
| **Mail** | Any IMAP mailbox (Gmail included), two-way: archive and delete here are archive and delete there. Process to inbox zero, turning emails into Next tasks, with rules per sender. |
| **Dough** | Every way you are trying to make money, each a chain of next actions with a signal of whether it is moving. |
| **Joblowski** | Job search across several sources, alerts for new matches, an application tracker, and résumé and cover-letter versions that export to PDF. |
| **Porcupin** | A pinboard for photos, links and YouTube videos, sorted into projects. |
| **Banki** | Personal bookkeeping: bank statement import with de-duplication, posted to a double-entry ledger. |
| **Bokki** | Business books for a Norwegian sole trader (ENK): vouchers with receipt photos on an NS 4102 chart of accounts, income statement, balance sheet, the MVA threshold. |
| **NutriLabel** | Nutrition tables and package labels from recipes, for Canada and Norway. |
| …and some toys | A periodic table, the Standard Model, a grapher, a piano and pitch trainer, a radio lab. |

The home screen shows each app's latest item and a count of what is waiting,
and the top bar's icons can be dragged into your own order.

## Quick start

You need Node 20 or later, and Docker.

```bash
git clone https://github.com/dunderjeep/janki.git
cd janki
npm install

cp .env.example .env                 # database and storage passwords
cp app/.env.example app/.env.local   # the app's settings; set AUTH_SECRET at least
#   openssl rand -base64 32          # a good AUTH_SECRET

docker compose up -d                 # PostgreSQL and MinIO
npm run db:migrate -w app            # create every app's tables
npm run dev -w app                   # http://localhost:3001
```

Sign in with a **Bluesky** handle and an app password (no setup), or with
**Google** once you have added an OAuth client to `app/.env.local`. Your notes,
and the apps built on them (Next, Focus, Daily, Scatterbrain), belong to a
Bluesky identity, so link one under *Settings → Linked accounts* if you signed
in with Google.

Everything else is optional and switched on in `app/.env.local`: a Claude API
key for drafting, a mail encryption key for Mail, your business details for
Bokki. The file says what each setting does.

To run it as a background service on Linux (systemd user unit, production
build, memory caps), see [deploy/README.md](deploy/README.md).

## How it fits together

```
janki/
├── app/          the shell: sign-in, home screen, nav, settings, and the
│                 apps not yet split out (Next, Dough, SRS, Banki, Bokki, …)
├── app-kit/      @janki/app-kit: the contract between an app and its host
├── notes/        notes as records, with an org-mode parser and writer
├── mail/         Mail
├── joblowski/    Joblowski, also runs standalone
└── nutrilabel/   NutriLabel, also runs standalone
```

It is an npm workspace: Next.js 15 (app router), TypeScript, Tailwind,
Drizzle over PostgreSQL, and PGlite when an app runs on its own.

The rules for an app (see [app-kit/README.md](app-kit/README.md)):

- An app owns **one Postgres schema** and its own migrations.
- An app **never imports another app or the shell.** When it can use something
  from elsewhere (Mail turning an email into a Next task, NutriLabel reading
  recipes), it declares an optional **host slot**, and the shell fills it in.
  Leave a slot empty and the app quietly drops that feature.
- The same app runs inside janki (the shell's database and signed-in user) or
  on its own (one person, PGlite on disk, no sign-in).

### Your own apps

Write a package to the app-kit contract, add it to the workspace, and mount
it in `app/` with a page and an API route, as `mail/` is. An app you keep to
yourself can live in a gitignored folder and still get a home-screen tile:
list it in `JANKI_EXTRA_APPS` in `app/.env.local`.

## Status

This is the tool I use every day, published as it is. Some apps are built
for where I live (Norwegian bookkeeping, Canadian and Norwegian labels, a few
Canadian banks' statement formats). Moving the remaining apps out of `app/`
into packages of their own is under way.

## Licence

MIT. See [LICENSE](LICENSE).
