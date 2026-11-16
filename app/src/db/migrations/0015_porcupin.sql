-- Porcupin — a personal pinboard.
--
--   boards      named projects. "ALL" is not a row: it is simply every pin.
--   pins        one uploaded photo, with an optional title and description
--   pin_boards  which projects a pin is in (any number, including none)
--   pin_links   the Focus (org-roam) or Quilt graph nodes a pin is about
--
-- pin_links keeps node_label because Focus nodes live in org-roam's SQLite
-- database rather than here, so there is nothing to join a title from.

CREATE SCHEMA IF NOT EXISTS "porcupin";

CREATE TABLE "porcupin"."boards" (
  "id" text PRIMARY KEY NOT NULL,
  "owner_uid" text NOT NULL,
  "name" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "porcupin_boards_owner_name_unique"
  ON "porcupin"."boards" ("owner_uid", lower("name"));

CREATE TABLE "porcupin"."pins" (
  "id" text PRIMARY KEY NOT NULL,
  "owner_uid" text NOT NULL,
  "storage_key" text NOT NULL,
  "thumb_key" text,
  "filename" text NOT NULL,
  "content_type" text NOT NULL,
  "size_bytes" integer NOT NULL,
  "sha256" text NOT NULL,
  "width" integer,
  "height" integer,
  "title" text,
  "description" text,
  "source_url" text,                  -- where it came from, if dropped or pasted from the web
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  -- Dropping the same photo twice finds the first copy instead of making another.
  CONSTRAINT "porcupin_pins_owner_sha256_unique" UNIQUE ("owner_uid", "sha256")
);
CREATE INDEX "porcupin_pins_owner_created_idx"
  ON "porcupin"."pins" ("owner_uid", "created_at" DESC);

CREATE TABLE "porcupin"."pin_boards" (
  "pin_id" text NOT NULL REFERENCES "porcupin"."pins" ("id") ON DELETE CASCADE,
  "board_id" text NOT NULL REFERENCES "porcupin"."boards" ("id") ON DELETE CASCADE,
  "added_at" timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY ("pin_id", "board_id")
);
CREATE INDEX "porcupin_pin_boards_board_idx" ON "porcupin"."pin_boards" ("board_id");

CREATE TABLE "porcupin"."pin_links" (
  "pin_id" text NOT NULL REFERENCES "porcupin"."pins" ("id") ON DELETE CASCADE,
  "graph" text NOT NULL CHECK ("graph" IN ('focus', 'quilt')),
  "node_id" text NOT NULL,
  "node_label" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY ("pin_id", "graph", "node_id")
);
CREATE INDEX "porcupin_pin_links_node_idx" ON "porcupin"."pin_links" ("graph", "node_id");
