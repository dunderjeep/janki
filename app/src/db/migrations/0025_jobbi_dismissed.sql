-- "Not this one": an ad dismissed from alerts stays dismissed when a source
-- finds it again.
--
-- listings.ad_key is the title and company reduced to letters and digits, the
-- key that already dedupes one ad across sources, so a dismissal also covers
-- the same ad from another board, or re-posted under a new id.
ALTER TABLE "jobbi"."listings" ADD COLUMN "ad_key" text GENERATED ALWAYS AS (
  lower(regexp_replace("title" || "company", '[^[:alnum:]]+', '', 'g'))
) STORED;

CREATE TABLE "jobbi"."dismissed" (
  "owner_uid" text NOT NULL,
  "ad_key" text NOT NULL,
  "title" text NOT NULL,
  "company" text NOT NULL,
  "dismissed_at" timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY ("owner_uid", "ad_key")
);
