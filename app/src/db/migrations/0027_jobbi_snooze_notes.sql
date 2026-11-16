-- Snooze and notes.
--
-- A parked job with parked_until comes back to its earlier status on that day:
-- a tickler file. A status event with no status is a note in the job's
-- history, such as "took the test" or "second interview".
ALTER TABLE "jobbi"."applications" ADD COLUMN "parked_until" date;
ALTER TABLE "jobbi"."status_events" ALTER COLUMN "status" DROP NOT NULL;
ALTER TABLE "jobbi"."status_events" ADD COLUMN "note" text;
ALTER TABLE "jobbi"."status_events" ADD CONSTRAINT "status_events_status_or_note"
  CHECK ("status" IS NOT NULL OR "note" IS NOT NULL);
