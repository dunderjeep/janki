-- For each heading, the nearest note or heading at or above it with an ID:
-- what a task list opens when you click a task that has no ID of its own.
-- Filled by reindexing (notes/scripts/reindex.ts) after this runs.
ALTER TABLE "notes"."headings" ADD COLUMN "node_org_id" text;
