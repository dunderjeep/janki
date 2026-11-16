-- The text of the ad an application is for, since ads disappear once they close,
-- and the review notes that come with a draft written by Claude.
ALTER TABLE "jobbi"."applications" ADD COLUMN "posting" text DEFAULT '' NOT NULL;
ALTER TABLE "jobbi"."documents" ADD COLUMN "ai_notes" jsonb;
