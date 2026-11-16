-- Bokki — bookkeeping for a Norwegian enkeltpersonforetak (sole proprietorship).
--
-- Unlike Banki, nothing is imported: every voucher (bilag) is keyed in by hand
-- from a receipt or a sale, and the receipt image is kept beside it.
--
--   accounts         chart of accounts, numbered per NS 4102 (Norsk Standard kontoplan)
--   vouchers         bilag — one per economic event, numbered gaplessly per owner
--   voucher_lines    its debits and credits
--   receipts         the documentation (kvittering, faktura) a voucher rests on
--
-- The same two rules as Banki, enforced by triggers so no code path can skip them:
--   1. every voucher balances (debits = credits, at least two lines)
--   2. vouchers, their lines and their receipts are append-only — a mistake is
--      corrected by a reversing voucher, and documentation is never thrown away
--      (bokføringsloven § 13: primary documentation is kept for five years)

CREATE SCHEMA IF NOT EXISTS "bokki";

-- ── Chart of accounts ───────────────────────────────────────────────────────
CREATE TABLE "bokki"."accounts" (
  "id" text PRIMARY KEY NOT NULL,
  "owner_uid" text NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,               -- Norwegian, as an accountant would say it
  "name_en" text NOT NULL,
  "type" text NOT NULL
    CHECK ("type" IN ('asset', 'liability', 'equity', 'income', 'expense')),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "bokki_accounts_owner_code_unique" UNIQUE ("owner_uid", "code")
);

-- ── Vouchers (bilag) ────────────────────────────────────────────────────────
CREATE TABLE "bokki"."vouchers" (
  "id" text PRIMARY KEY NOT NULL,
  "owner_uid" text NOT NULL,
  "voucher_no" integer NOT NULL,      -- bilagsnummer, gapless per owner
  "posted_on" date NOT NULL,
  "kind" text NOT NULL
    CHECK ("kind" IN ('expense', 'sale', 'owner_in', 'owner_out', 'reversal')),
  "description" text NOT NULL,
  "counterparty" text,                -- supplier on an expense, customer on a sale
  -- MVA as printed on the receipt. Recorded, not posted: an ENK below the
  -- NOK 50 000 registration threshold can't deduct input VAT, so the cost is
  -- the gross amount. Kept so the figures are there on the day it registers.
  "mva_rate" integer CHECK ("mva_rate" IN (0, 12, 15, 25)),
  "mva_cents" bigint CHECK ("mva_cents" >= 0),
  "reverses_id" text UNIQUE REFERENCES "bokki"."vouchers"("id"),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "bokki_vouchers_owner_no_unique" UNIQUE ("owner_uid", "voucher_no")
);

CREATE INDEX "bokki_vouchers_owner_date_idx" ON "bokki"."vouchers" ("owner_uid", "posted_on");

CREATE TABLE "bokki"."voucher_lines" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "voucher_id" text NOT NULL REFERENCES "bokki"."vouchers"("id"),
  "account_id" text NOT NULL REFERENCES "bokki"."accounts"("id"),
  "debit_cents" bigint DEFAULT 0 NOT NULL CHECK ("debit_cents" >= 0),
  "credit_cents" bigint DEFAULT 0 NOT NULL CHECK ("credit_cents" >= 0),
  CONSTRAINT "bokki_voucher_lines_one_side" CHECK (("debit_cents" = 0) <> ("credit_cents" = 0))
);

CREATE INDEX "bokki_voucher_lines_voucher_idx" ON "bokki"."voucher_lines" ("voucher_id");
CREATE INDEX "bokki_voucher_lines_account_idx" ON "bokki"."voucher_lines" ("account_id");

-- ── Documentation ───────────────────────────────────────────────────────────
-- The file itself lives in the private MinIO bucket under storage_key; the
-- sha256 lets anyone later show the stored file is the one that was filed.
CREATE TABLE "bokki"."receipts" (
  "id" text PRIMARY KEY NOT NULL,
  "owner_uid" text NOT NULL,
  "voucher_id" text NOT NULL REFERENCES "bokki"."vouchers"("id"),
  "storage_key" text NOT NULL UNIQUE,
  "filename" text NOT NULL,
  "content_type" text NOT NULL,
  "size_bytes" integer NOT NULL,
  "sha256" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX "bokki_receipts_voucher_idx" ON "bokki"."receipts" ("voucher_id");

-- ── Rule 1: every voucher balances ──────────────────────────────────────────
-- Deferred to COMMIT: lines arrive one row at a time, so a voucher is only
-- unbalanced mid-flight. Fires on the voucher too, so one with no lines fails.
CREATE FUNCTION "bokki"."voucher_must_balance"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  vid text := coalesce(to_jsonb(NEW) ->> 'voucher_id', to_jsonb(NEW) ->> 'id');
  d bigint;
  c bigint;
  n integer;
BEGIN
  SELECT coalesce(sum(debit_cents), 0), coalesce(sum(credit_cents), 0), count(*)
    INTO d, c, n
    FROM bokki.voucher_lines
   WHERE voucher_id = vid;
  IF n < 2 OR d <> c THEN
    RAISE EXCEPTION 'voucher % does not balance: debits %, credits %, over % lines', vid, d, c, n;
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER "vouchers_balance"
  AFTER INSERT ON "bokki"."vouchers"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "bokki"."voucher_must_balance"();

CREATE CONSTRAINT TRIGGER "voucher_lines_balance"
  AFTER INSERT ON "bokki"."voucher_lines"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "bokki"."voucher_must_balance"();

-- ── Rule 2: append-only ─────────────────────────────────────────────────────
-- TRUNCATE is the deliberate escape hatch for wiping test data from psql.
CREATE FUNCTION "bokki"."append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'bokki is append-only: % on % refused — post a reversing voucher instead',
    TG_OP, TG_TABLE_NAME;
END $$;

CREATE TRIGGER "vouchers_append_only"
  BEFORE UPDATE OR DELETE ON "bokki"."vouchers"
  FOR EACH ROW EXECUTE FUNCTION "bokki"."append_only"();

CREATE TRIGGER "voucher_lines_append_only"
  BEFORE UPDATE OR DELETE ON "bokki"."voucher_lines"
  FOR EACH ROW EXECUTE FUNCTION "bokki"."append_only"();

CREATE TRIGGER "receipts_append_only"
  BEFORE UPDATE OR DELETE ON "bokki"."receipts"
  FOR EACH ROW EXECUTE FUNCTION "bokki"."append_only"();
