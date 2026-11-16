-- Banki — double-entry bookkeeping over imported bank and card statements.
--
-- Three layers, each only ever appended to:
--   imports           one row per file (or spreadsheet tab) brought in
--   statement_lines   what the bank said, verbatim, deduplicated
--   journal_entries   what it means in double entry — the general ledger
--   + journal_lines
--
-- Two bookkeeping rules are enforced here rather than in application code, so
-- no code path can skip them:
--   1. every journal entry balances (debits = credits, at least two lines)
--   2. the ledger is append-only — a correction is a reversing entry, not an edit

CREATE SCHEMA IF NOT EXISTS "banki";

-- ── Chart of accounts ───────────────────────────────────────────────────────
CREATE TABLE "banki"."accounts" (
  "id" text PRIMARY KEY NOT NULL,
  "owner_uid" text NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "type" text NOT NULL
    CHECK ("type" IN ('asset', 'liability', 'equity', 'income', 'expense')),
  -- Set only on accounts a statement export can be imported into.
  "statement_format" text
    CHECK ("statement_format" IN ('td_chequing', 'td_visa', 'pc_mastercard')),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "accounts_owner_code_unique" UNIQUE ("owner_uid", "code")
);

-- ── Source documents ────────────────────────────────────────────────────────
CREATE TABLE "banki"."imports" (
  "id" text PRIMARY KEY NOT NULL,
  "owner_uid" text NOT NULL,
  "account_id" text NOT NULL REFERENCES "banki"."accounts"("id"),
  "filename" text NOT NULL,
  "sheet" text,                       -- tab name, for a spreadsheet
  "format" text NOT NULL,
  "file_sha256" text NOT NULL,
  "rows_read" integer NOT NULL,
  "rows_new" integer NOT NULL,
  "rows_duplicate" integer NOT NULL,
  "first_date" date,
  "last_date" date,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE "banki"."statement_lines" (
  "id" text PRIMARY KEY NOT NULL,
  "owner_uid" text NOT NULL,
  "account_id" text NOT NULL REFERENCES "banki"."accounts"("id"),
  "import_id" text NOT NULL REFERENCES "banki"."imports"("id"),
  "posted_on" date NOT NULL,
  "description" text NOT NULL,
  -- Both amounts are signed as a DEBIT to this account, whatever its type:
  -- + is money in to a bank account, or a payment/refund on a card;
  -- − is money out of a bank account, or a charge on a card.
  "amount_cents" bigint NOT NULL CHECK ("amount_cents" <> 0),
  "balance_cents" bigint,             -- running balance the bank printed, if any
  "line_seq" integer NOT NULL,        -- chronological position within its import
  -- Dedup key. fingerprint = hash(date, description, amount); occurrence is
  -- which repeat of that fingerprint this is within its own file. Two genuine
  -- identical charges on one day are occurrences 0 and 1 and both survive; the
  -- same two rows arriving again in an overlapping export collide and don't.
  "fingerprint" text NOT NULL,
  "occurrence" integer NOT NULL,
  "raw" jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "statement_lines_dedup_unique" UNIQUE ("account_id", "fingerprint", "occurrence")
);

CREATE INDEX "statement_lines_account_date_idx"
  ON "banki"."statement_lines" ("account_id", "posted_on");

-- ── General ledger ──────────────────────────────────────────────────────────
CREATE TABLE "banki"."journal_entries" (
  "id" text PRIMARY KEY NOT NULL,
  "owner_uid" text NOT NULL,
  "entry_no" integer NOT NULL,        -- gapless per owner
  "posted_on" date NOT NULL,
  "memo" text NOT NULL,
  "source" text NOT NULL
    CHECK ("source" IN ('statement', 'opening', 'reversal', 'manual')),
  "statement_line_id" text REFERENCES "banki"."statement_lines"("id"),
  "reverses_id" text UNIQUE REFERENCES "banki"."journal_entries"("id"),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "journal_entries_owner_no_unique" UNIQUE ("owner_uid", "entry_no")
);

CREATE INDEX "journal_entries_owner_date_idx"
  ON "banki"."journal_entries" ("owner_uid", "posted_on");
CREATE INDEX "journal_entries_statement_line_idx"
  ON "banki"."journal_entries" ("statement_line_id");

CREATE TABLE "banki"."journal_lines" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "entry_id" text NOT NULL REFERENCES "banki"."journal_entries"("id"),
  "account_id" text NOT NULL REFERENCES "banki"."accounts"("id"),
  "debit_cents" bigint DEFAULT 0 NOT NULL CHECK ("debit_cents" >= 0),
  "credit_cents" bigint DEFAULT 0 NOT NULL CHECK ("credit_cents" >= 0),
  -- A line is a debit or a credit, never both and never neither.
  CONSTRAINT "journal_lines_one_side" CHECK (("debit_cents" = 0) <> ("credit_cents" = 0))
);

CREATE INDEX "journal_lines_entry_idx" ON "banki"."journal_lines" ("entry_id");
CREATE INDEX "journal_lines_account_idx" ON "banki"."journal_lines" ("account_id");

-- ── Rule 1: every entry balances ────────────────────────────────────────────
-- Deferred to COMMIT, because the lines of an entry arrive one row at a time
-- and the entry is only unbalanced mid-flight. It fires on the entry as well as
-- on its lines, so an entry with no lines at all can't be committed either.
CREATE FUNCTION "banki"."entry_must_balance"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  eid text := coalesce(to_jsonb(NEW) ->> 'entry_id', to_jsonb(NEW) ->> 'id');
  d bigint;
  c bigint;
  n integer;
BEGIN
  SELECT coalesce(sum(debit_cents), 0), coalesce(sum(credit_cents), 0), count(*)
    INTO d, c, n
    FROM banki.journal_lines
   WHERE entry_id = eid;
  IF n < 2 OR d <> c THEN
    RAISE EXCEPTION 'journal entry % does not balance: debits %, credits %, over % lines',
      eid, d, c, n;
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER "journal_entries_balance"
  AFTER INSERT ON "banki"."journal_entries"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "banki"."entry_must_balance"();

CREATE CONSTRAINT TRIGGER "journal_lines_balance"
  AFTER INSERT ON "banki"."journal_lines"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "banki"."entry_must_balance"();

-- ── Rule 2: the ledger is append-only ───────────────────────────────────────
-- TRUNCATE is deliberately not covered: it is the escape hatch for wiping test
-- data from psql, and nothing in the app issues it.
CREATE FUNCTION "banki"."ledger_is_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'the general ledger is append-only: % on % refused — post a reversing entry instead',
    TG_OP, TG_TABLE_NAME;
END $$;

CREATE TRIGGER "journal_entries_append_only"
  BEFORE UPDATE OR DELETE ON "banki"."journal_entries"
  FOR EACH ROW EXECUTE FUNCTION "banki"."ledger_is_append_only"();

CREATE TRIGGER "journal_lines_append_only"
  BEFORE UPDATE OR DELETE ON "banki"."journal_lines"
  FOR EACH ROW EXECUTE FUNCTION "banki"."ledger_is_append_only"();
