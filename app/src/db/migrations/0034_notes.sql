-- Notes (the notes/ workspace package). Same DDL as notes/migrations/0001_init.sql.

CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS "notes";
--> statement-breakpoint
CREATE TABLE "notes"."records" (
  "did" text NOT NULL,
  "collection" text NOT NULL,
  "rkey" text NOT NULL,
  "value" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("did", "collection", "rkey")
);
--> statement-breakpoint
-- A path names at most one note per owner.
CREATE UNIQUE INDEX "notes_records_path_idx" ON "notes"."records" ("did", "collection", ("value"->>'path'))
  WHERE "value" ? 'path';
--> statement-breakpoint
-- One row per heading, plus row 0 for the note itself.
CREATE TABLE "notes"."headings" (
  "did" text NOT NULL,
  "collection" text NOT NULL,
  "rkey" text NOT NULL,
  -- 0 is the note; n is headings[n-1].
  "idx" integer NOT NULL,
  "level" integer NOT NULL,
  "org_id" text,
  "title" text NOT NULL,
  "todo" text,
  "done" boolean NOT NULL DEFAULT false,
  "priority" text,
  "tags" text[] NOT NULL DEFAULT '{}',
  -- Its own tags with every ancestor's and the note's.
  "all_tags" text[] NOT NULL DEFAULT '{}',
  -- Titles from the note down to the parent heading.
  "olp" text[] NOT NULL DEFAULT '{}',
  "scheduled" date,
  "scheduled_ts" jsonb,
  "deadline" date,
  "deadline_ts" jsonb,
  "closed" timestamp without time zone,
  -- Keys upper-cased; a repeated key keeps its first value.
  "properties" jsonb NOT NULL DEFAULT '{}',
  "body" text NOT NULL DEFAULT '',
  "search" tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple'::regconfig, "title"), 'A') ||
    setweight(to_tsvector('english'::regconfig, "body"), 'B')
  ) STORED,
  PRIMARY KEY ("did", "collection", "rkey", "idx"),
  FOREIGN KEY ("did", "collection", "rkey") REFERENCES "notes"."records" ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX "notes_headings_org_id_idx" ON "notes"."headings" ("did", "org_id") WHERE "org_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "notes_headings_search_idx" ON "notes"."headings" USING gin ("search");
--> statement-breakpoint
CREATE INDEX "notes_headings_title_trgm_idx" ON "notes"."headings" USING gin ("title" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "notes_headings_scheduled_idx" ON "notes"."headings" ("did", "scheduled") WHERE "scheduled" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "notes_headings_deadline_idx" ON "notes"."headings" ("did", "deadline") WHERE "deadline" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "notes_headings_todo_idx" ON "notes"."headings" ("did", "todo") WHERE "todo" IS NOT NULL;
--> statement-breakpoint
-- id: links, attributed like org-roam: to the nearest heading (or the note) that has an ID.
CREATE TABLE "notes"."links" (
  "did" text NOT NULL,
  "collection" text NOT NULL,
  "rkey" text NOT NULL,
  -- The heading the link is written in (0: the note's own text).
  "idx" integer NOT NULL,
  "source_org_id" text,
  "target_org_id" text NOT NULL,
  "description" text,
  FOREIGN KEY ("did", "collection", "rkey") REFERENCES "notes"."records" ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX "notes_links_target_idx" ON "notes"."links" ("did", "target_org_id");
--> statement-breakpoint
CREATE INDEX "notes_links_source_idx" ON "notes"."links" ("did", "source_org_id");
--> statement-breakpoint
CREATE INDEX "notes_links_record_idx" ON "notes"."links" ("did", "collection", "rkey");
