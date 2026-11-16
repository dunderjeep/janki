-- Generalize srs_streaks into activity_streaks, keyed by (owner_uid, activity),
-- so the Morse trainer (and anything after it) gets a persisted daily streak
-- instead of one that lives only in browser localStorage.
--
-- Done as a RENAME rather than create-copy-drop so the existing streak history
-- carries over in place and nothing has to be reinserted.

ALTER TABLE "janki"."srs_streaks" RENAME TO "activity_streaks";
ALTER TABLE "janki"."activity_streaks" RENAME COLUMN "id" TO "owner_uid";

-- Existing rows are all SRS review by definition. The default is dropped again
-- below so future inserts have to name their activity explicitly.
ALTER TABLE "janki"."activity_streaks"
  ADD COLUMN "activity" text NOT NULL DEFAULT 'srs';

ALTER TABLE "janki"."activity_streaks" DROP CONSTRAINT "srs_streaks_pkey";
ALTER TABLE "janki"."activity_streaks"
  ADD CONSTRAINT "activity_streaks_pkey" PRIMARY KEY ("owner_uid", "activity");

ALTER TABLE "janki"."activity_streaks" ALTER COLUMN "activity" DROP DEFAULT;

-- Koch trainer progress: previously localStorage-only, so a browser data wipe
-- reset the level and the LAN address had its own separate history.
CREATE TABLE "janki"."morse_progress" (
  "owner_uid" text PRIMARY KEY NOT NULL,
  "koch_level" integer DEFAULT 0 NOT NULL,
  "letter_accuracy" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
