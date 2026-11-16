-- Jobbi — job search, application tracking, résumés and cover letters.
--
--   documents       a résumé or cover letter, always holding its latest text
--   revisions       immutable copies of a document; an application points at
--                   one, so the record of what was sent survives later edits
--   applications    one job being pursued
--   status_events   every status an application has been in
--   listings        job ads pulled from public sources, shared by all users
--   source_state    when each source was last pulled; keeps within rate limits
--   saved_searches  a search to re-run, optionally as an alert
--   hits            which listings each alert has already found
--   boards          the person's own job-board links

CREATE SCHEMA IF NOT EXISTS "jobbi";

CREATE TABLE "jobbi"."documents" (
  "id" text PRIMARY KEY NOT NULL,
  "owner_uid" text NOT NULL,
  "kind" text NOT NULL CHECK ("kind" IN ('resume', 'letter')),
  "name" text NOT NULL,
  "body" text DEFAULT '' NOT NULL,
  "style" text DEFAULT 'classic' NOT NULL CHECK ("style" IN ('classic', 'modern')),
  "derived_from" text REFERENCES "jobbi"."documents" ("id") ON DELETE SET NULL,
  "archived_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX "jobbi_documents_owner_idx" ON "jobbi"."documents" ("owner_uid", "kind", "updated_at" DESC);

CREATE TABLE "jobbi"."revisions" (
  "id" text PRIMARY KEY NOT NULL,
  "document_id" text NOT NULL REFERENCES "jobbi"."documents" ("id") ON DELETE CASCADE,
  "owner_uid" text NOT NULL,
  "name" text NOT NULL,
  "body" text NOT NULL,
  "style" text NOT NULL,
  "sha256" text NOT NULL,
  "label" text,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX "jobbi_revisions_document_idx" ON "jobbi"."revisions" ("document_id", "created_at" DESC);

CREATE TABLE "jobbi"."applications" (
  "id" text PRIMARY KEY NOT NULL,
  "owner_uid" text NOT NULL,
  "company" text NOT NULL,
  "role" text NOT NULL,
  "url" text,
  "location" text,
  "status" text DEFAULT 'saved' NOT NULL
    CHECK ("status" IN ('saved', 'applied', 'interview', 'offer', 'rejected', 'withdrawn')),
  "date_applied" date,
  "due_date" date,
  "notes" text DEFAULT '' NOT NULL,
  "source" text,
  "resume_revision_id" text REFERENCES "jobbi"."revisions" ("id") ON DELETE RESTRICT,
  "letter_revision_id" text REFERENCES "jobbi"."revisions" ("id") ON DELETE RESTRICT,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX "jobbi_applications_owner_idx" ON "jobbi"."applications" ("owner_uid", "created_at" DESC);
CREATE UNIQUE INDEX "jobbi_applications_owner_url_unique"
  ON "jobbi"."applications" ("owner_uid", "url") WHERE "url" IS NOT NULL;

CREATE TABLE "jobbi"."status_events" (
  "id" text PRIMARY KEY NOT NULL,
  "application_id" text NOT NULL REFERENCES "jobbi"."applications" ("id") ON DELETE CASCADE,
  "owner_uid" text NOT NULL,
  "status" text NOT NULL,
  "at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX "jobbi_status_events_application_idx" ON "jobbi"."status_events" ("application_id", "at");

CREATE TABLE "jobbi"."listings" (
  "id" text PRIMARY KEY NOT NULL,
  "source" text NOT NULL,
  "title" text NOT NULL,
  "company" text DEFAULT '' NOT NULL,
  "location" text DEFAULT '' NOT NULL,
  "remote" boolean DEFAULT false NOT NULL,
  "url" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "tags" text DEFAULT '' NOT NULL,
  "salary" text,
  "published_at" timestamptz,
  "expires_on" date,
  "first_seen_at" timestamptz DEFAULT now() NOT NULL,
  "last_seen_at" timestamptz DEFAULT now() NOT NULL,
  -- 'simple' rather than a language: ads arrive in Norwegian, German and English.
  "search" tsvector GENERATED ALWAYS AS (
    to_tsvector('simple'::regconfig, "title" || ' ' || "company" || ' ' || "tags" || ' ' || "description")
  ) STORED
);
CREATE INDEX "jobbi_listings_search_idx" ON "jobbi"."listings" USING gin ("search");
CREATE INDEX "jobbi_listings_published_idx" ON "jobbi"."listings" ("published_at" DESC NULLS LAST);
CREATE INDEX "jobbi_listings_last_seen_idx" ON "jobbi"."listings" ("last_seen_at");

CREATE TABLE "jobbi"."source_state" (
  "source" text PRIMARY KEY NOT NULL,
  "last_attempt_at" timestamptz,
  "fetched_at" timestamptz,
  "last_count" integer,
  "last_error" text
);

CREATE TABLE "jobbi"."saved_searches" (
  "id" text PRIMARY KEY NOT NULL,
  "owner_uid" text NOT NULL,
  "name" text NOT NULL,
  "query" text DEFAULT '' NOT NULL,
  "location" text DEFAULT '' NOT NULL,
  "sources" text[] NOT NULL,
  "alert" boolean DEFAULT true NOT NULL,
  "last_run_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX "jobbi_saved_searches_owner_idx" ON "jobbi"."saved_searches" ("owner_uid", "created_at");

CREATE TABLE "jobbi"."hits" (
  "search_id" text NOT NULL REFERENCES "jobbi"."saved_searches" ("id") ON DELETE CASCADE,
  "listing_id" text NOT NULL REFERENCES "jobbi"."listings" ("id") ON DELETE CASCADE,
  "owner_uid" text NOT NULL,
  "first_seen_at" timestamptz DEFAULT now() NOT NULL,
  "seen_at" timestamptz,
  PRIMARY KEY ("search_id", "listing_id")
);
CREATE INDEX "jobbi_hits_unseen_idx" ON "jobbi"."hits" ("owner_uid") WHERE "seen_at" IS NULL;

CREATE TABLE "jobbi"."boards" (
  "id" text PRIMARY KEY NOT NULL,
  "owner_uid" text NOT NULL,
  "name" text NOT NULL,
  "url_template" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX "jobbi_boards_owner_idx" ON "jobbi"."boards" ("owner_uid", "created_at");
