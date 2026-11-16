-- Search filters, the ladder, language, pay and rates.
--
--   saved_searches.filters  posted within N days, language, starting soon, with pay
--   saved_searches.rank     the ladder: narrow searches first, broad ones last
--   listings.language       en, no, de or other, from the ad's own little words
--   listings.pay_*          pay as the ad states it: amount, currency and period
--   rates                   NOK per one unit of each currency, edited by hand
ALTER TABLE "jobbi"."saved_searches"
  ADD COLUMN "filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
  ADD COLUMN "rank" integer DEFAULT 0 NOT NULL;
ALTER TABLE "jobbi"."listings"
  ADD COLUMN "language" text,
  ADD COLUMN "pay_min" double precision,
  ADD COLUMN "pay_max" double precision,
  ADD COLUMN "pay_currency" text,
  ADD COLUMN "pay_period" text;
CREATE TABLE "jobbi"."rates" (
  "currency" text PRIMARY KEY NOT NULL,
  "nok" double precision NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
INSERT INTO "jobbi"."rates" ("currency", "nok") VALUES
  ('NOK', 1), ('USD', 10.5), ('EUR', 11.6), ('GBP', 13.5), ('CAD', 7.5), ('SEK', 1.05), ('DKK', 1.55), ('CHF', 12.6);
