# notes

Org-style notes as private ATProto records in Postgres: an outline of headings
with TODOs, priorities, tags, scheduled and deadline dates, repeaters, property
drawers and `id:` links. It does what janki used to ask Emacs and org-roam for.

## Data

- **Records** (`notes.records`) are the truth. Each note is one
  `com.dunderjeep.janki.note` record (see `lexicons/`), owned by a DID and
  addressed `at://<did>/com.dunderjeep.janki.note/<rkey>`, where the rkey is a
  TID. They are private for now, and shaped so they can be published to a PDS later.
- **Indexes** (`notes.headings`, `notes.links`) are derived. They are rebuilt in
  the same transaction whenever a record is saved: one row per heading (row 0
  is the note itself), and one per `id:` link. A link is attributed, as in
  org-roam, to the nearest heading above it that has an ID.

## API (`/api/notes/…`)

| | |
|---|---|
| `GET find?q=` | Find a note or linkable heading by name as you type (prefix, contains, trigram) |
| `GET search?q=` | Full-text search; snippets mark matches with ⟦ ⟧ |
| `GET notes`, `GET/PUT/DELETE notes/:rkey`, `POST notes` | Records |
| `GET notes/:rkey/org` | A note as an .org file |
| `GET nodes/:id` | A heading or note by org ID, with backlinks and links out |
| `GET graph` | Every linkable node and the links that resolve at both ends |
| `GET agenda?from=&days=` | Open scheduled and deadline items: repeats, overdue items, deadline warnings |

## Importing org files, and the mirror

```sh
DATABASE_URL=… npm run import-org -- --dir ~/org --did did:plc:… [--dry-run]
npm run roundtrip -- ~/org   # parse and write back every file; reports anything lost
npm test
```

The import goes through the one-way mirror (`notes/mirror`). A changed file
replaces its note under the same rkey, and a deleted file takes its note with
it. A note edited in janki since the last sync is left alone and reported as a
conflict. Notes are never written back to files.

In janki, setting `NOTES_ORG_DIR=~/org` and `NOTES_ORG_DID` (whose notes it is) in `app/.env.local` runs the mirror for that one person
before Quilt reads, at most every 15 seconds. It's for the changeover from
Emacs. Leave it unset on a hosted janki, where notes live only in Postgres.

Parsing keeps
anything it does not fully understand in the body, word for word. What it does
structure, it writes back in org's canonical layout: LF line endings, tags at
column 77, one space after a property key.

The host's `userId()` must return a DID. A schema change goes in two places:
`migrations/` here and a janki migration (0034_notes.sql).
