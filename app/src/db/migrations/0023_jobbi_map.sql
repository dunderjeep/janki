-- Jobbi's map: where each job is, the walks planned between them, and the
-- point a walk starts from.
ALTER TABLE "jobbi"."applications" ADD COLUMN "address" text;
--> statement-breakpoint
ALTER TABLE "jobbi"."applications" ADD COLUMN "lat" double precision;
--> statement-breakpoint
ALTER TABLE "jobbi"."applications" ADD COLUMN "lon" double precision;
--> statement-breakpoint
CREATE TABLE "jobbi"."walks" (
  "id" text PRIMARY KEY,
  "owner_uid" text NOT NULL,
  "name" text NOT NULL,
  "stop_ids" text[] NOT NULL DEFAULT '{}',
  "route" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "jobbi_walks_owner_idx" ON "jobbi"."walks" ("owner_uid", "updated_at");
--> statement-breakpoint
CREATE TABLE "jobbi"."map_home" (
  "owner_uid" text PRIMARY KEY,
  "address" text NOT NULL,
  "lat" double precision NOT NULL,
  "lon" double precision NOT NULL
);
