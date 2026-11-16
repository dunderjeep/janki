-- Dough: the money fronts. The fronts and their steps live in ~/org/dough.org;
-- this holds only what org does not: the order you dragged next actions into,
-- and money that came in on fronts janki has no app for.
CREATE SCHEMA IF NOT EXISTS "dough";
--> statement-breakpoint
CREATE TABLE "dough"."focus" (
  "owner_uid" text NOT NULL,
  "key" text NOT NULL,
  "rank" integer NOT NULL,
  PRIMARY KEY ("owner_uid", "key")
);
--> statement-breakpoint
CREATE TABLE "dough"."tallies" (
  "id" text PRIMARY KEY,
  "owner_uid" text NOT NULL,
  "front_id" text NOT NULL,
  "on_date" date NOT NULL,
  "amount_cents" bigint NOT NULL CHECK ("amount_cents" <> 0),
  "currency" text NOT NULL CHECK ("currency" IN ('NOK', 'CAD', 'USD', 'EUR')),
  "note" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "dough_tallies_owner_front_idx" ON "dough"."tallies" ("owner_uid", "front_id", "on_date");
