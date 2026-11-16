-- What a link means: the description-list term on its line, `- supports :: [[id:…]]`.
ALTER TABLE "notes"."links" ADD COLUMN "label" text;
--> statement-breakpoint
-- The one-way mirror from a folder of .org files, for the changeover from Emacs.
-- One row per file last synced: its modification time then, and when.
CREATE TABLE "notes"."mirror" (
  "did" text NOT NULL,
  "path" text NOT NULL,
  "rkey" text NOT NULL,
  "mtime_ms" double precision NOT NULL,
  "synced_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("did", "path")
);
