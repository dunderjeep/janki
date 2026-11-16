-- Scatterbrain writing targets.
--
-- session_words is a running total of words written today, added to on each
-- save, rather than a difference from the work's total. A difference would count
-- a 5,000-word org file as 5,000 words written the moment it was linked in.
-- session_day says which day that total belongs to; a new day starts it again.

ALTER TABLE "scatterbrain"."works"
  ADD COLUMN "session_target" integer,
  ADD COLUMN "session_words" integer DEFAULT 0 NOT NULL,
  ADD COLUMN "session_day" text;

ALTER TABLE "scatterbrain"."items"
  ADD COLUMN "target_words" integer;
