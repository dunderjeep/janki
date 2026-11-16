-- Allow auth.users.email to be NULL so Bluesky-only accounts (which have no
-- email address) can be stored. Google OAuth users always supply an email, so
-- the NOT NULL invariant still holds for them in practice.
ALTER TABLE "auth"."users" ALTER COLUMN "email" DROP NOT NULL;
