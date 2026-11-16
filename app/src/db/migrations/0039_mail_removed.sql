-- Mail archived or deleted here (or gone from the server) leaves the lists at
-- once, but its local copy is kept for 30 days, so another app reading mail
-- (through searchMail with includeRemoved) still finds what was dealt with
-- before it looked.
ALTER TABLE mail.messages ADD COLUMN IF NOT EXISTS removed_at timestamptz;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS mail_messages_removed ON mail.messages (removed_at) WHERE removed_at IS NOT NULL;
