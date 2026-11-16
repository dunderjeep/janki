-- Processing mail to zero: each email is dealt with once (made a task, sent on,
-- archived, deleted, or kept). Rules do it for new mail from a sender or with
-- a subject, as it arrives.
ALTER TABLE mail.messages ADD COLUMN IF NOT EXISTS processed_at timestamptz;
--> statement-breakpoint
-- Mail already here when processing began counts as dealt with: the queue starts empty-handed, not with weeks of it.
UPDATE mail.messages SET processed_at = now() WHERE processed_at IS NULL AND sent_at < now() - interval '2 days';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS mail.rules (
  id             text PRIMARY KEY,
  owner_uid      text NOT NULL,
  -- Matched case-insensitively as parts of the sender's address and the subject. Either may be empty, not both.
  from_match     text NOT NULL DEFAULT '',
  subject_match  text NOT NULL DEFAULT '',
  -- task:<target> | archive | trash | keep. A target is one the host offers ("task", "inbox").
  action         text NOT NULL,
  -- With a task, archive the email in the mailbox as well.
  archive        boolean NOT NULL DEFAULT true,
  applied        integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS mail_rules_owner ON mail.rules (owner_uid);
