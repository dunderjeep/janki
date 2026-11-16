-- Links to your banks and money sites, shown along the top of Dough.
CREATE TABLE "dough"."links" (
  "id" text PRIMARY KEY,
  "owner_uid" text NOT NULL,
  "label" text NOT NULL,
  "url" text NOT NULL,
  "position" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "dough_links_owner_idx" ON "dough"."links" ("owner_uid", "position");
