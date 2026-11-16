-- Mail: IMAP accounts, and a searchable copy of the folders chosen, kept in
-- step both ways: read, archive and delete here happen on the server too, and
-- what changed on the server comes back on the next sync.
CREATE SCHEMA IF NOT EXISTS mail;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS mail.accounts (
  id            text PRIMARY KEY,
  owner_uid     text NOT NULL,
  label         text NOT NULL,
  address       text NOT NULL,
  host          text NOT NULL,
  port          integer NOT NULL DEFAULT 993,
  secure        boolean NOT NULL DEFAULT true,
  username      text NOT NULL,
  -- The password (for Gmail, an app password), encrypted with the host's key.
  secret        text NOT NULL,
  folders       text[] NOT NULL DEFAULT ARRAY['INBOX'],
  -- How far back the copy reaches.
  sync_days     integer NOT NULL DEFAULT 60,
  last_sync_at  timestamptz,
  last_error    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS mail_accounts_owner ON mail.accounts (owner_uid);
--> statement-breakpoint
-- Where each folder's sync got to. A new UIDVALIDITY means the server renumbered it.
CREATE TABLE IF NOT EXISTS mail.folders (
  account_id   text NOT NULL REFERENCES mail.accounts(id) ON DELETE CASCADE,
  name         text NOT NULL,
  uidvalidity  bigint NOT NULL,
  last_uid     bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, name)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS mail.messages (
  id           text PRIMARY KEY,
  owner_uid    text NOT NULL,
  account_id   text NOT NULL REFERENCES mail.accounts(id) ON DELETE CASCADE,
  folder       text NOT NULL,
  uidvalidity  bigint NOT NULL,
  uid          bigint NOT NULL,
  message_id   text,
  sent_at      timestamptz,
  from_name    text NOT NULL DEFAULT '',
  from_addr    text NOT NULL DEFAULT '',
  to_addrs     text NOT NULL DEFAULT '',
  subject      text NOT NULL DEFAULT '',
  snippet      text NOT NULL DEFAULT '',
  text_body    text NOT NULL DEFAULT '',
  html_body    text,
  seen         boolean NOT NULL DEFAULT false,
  fetched_at   timestamptz NOT NULL DEFAULT now(),
  search       tsvector GENERATED ALWAYS AS (
    to_tsvector('simple', subject || ' ' || from_name || ' ' || from_addr || ' ' || text_body)
  ) STORED,
  UNIQUE (account_id, folder, uidvalidity, uid)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS mail_messages_owner_sent ON mail.messages (owner_uid, sent_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS mail_messages_search ON mail.messages USING gin (search);
