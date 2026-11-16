-- A front's own page: files attached to it, links to related places, and
-- (in their own schema, so NutriLabel can build on them) recipes.
-- front_id is the front's CHAIN_ID in ~/org/dough.org.
CREATE TABLE "dough"."front_documents" (
  "id" text PRIMARY KEY,
  "owner_uid" text NOT NULL,
  "front_id" text NOT NULL,
  "storage_key" text NOT NULL UNIQUE,
  "filename" text NOT NULL,
  "content_type" text NOT NULL,
  "size_bytes" integer NOT NULL,
  "sha256" text NOT NULL,
  "note" text NOT NULL DEFAULT '',
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "dough_front_documents_front_idx" ON "dough"."front_documents" ("owner_uid", "front_id", "created_at");
--> statement-breakpoint
CREATE TABLE "dough"."front_links" (
  "id" text PRIMARY KEY,
  "owner_uid" text NOT NULL,
  "front_id" text NOT NULL,
  "label" text NOT NULL,
  -- https://… or a path inside janki such as /bokki
  "url" text NOT NULL,
  "position" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "dough_front_links_front_idx" ON "dough"."front_links" ("owner_uid", "front_id", "position");
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS "kitchen";
--> statement-breakpoint
CREATE TABLE "kitchen"."recipes" (
  "id" text PRIMARY KEY,
  "owner_uid" text NOT NULL,
  -- The front it is sold under, if any.
  "front_id" text,
  "title" text NOT NULL,
  "yield_qty" numeric,
  "yield_unit" text NOT NULL DEFAULT '',
  "method" text NOT NULL DEFAULT '',
  "notes" text NOT NULL DEFAULT '',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "kitchen_recipes_owner_idx" ON "kitchen"."recipes" ("owner_uid", "front_id", "title");
--> statement-breakpoint
CREATE TABLE "kitchen"."recipe_ingredients" (
  "id" text PRIMARY KEY,
  "recipe_id" text NOT NULL REFERENCES "kitchen"."recipes" ("id") ON DELETE CASCADE,
  "position" integer NOT NULL,
  "name" text NOT NULL,
  "quantity" numeric,
  "unit" text NOT NULL DEFAULT '',
  -- Keys from the EU list of 14 (lib/kitchen/allergens.ts).
  "allergens" text[] NOT NULL DEFAULT '{}',
  -- What this amount of the ingredient costs, in NOK.
  "cost_nok" numeric
);
--> statement-breakpoint
CREATE INDEX "kitchen_recipe_ingredients_recipe_idx" ON "kitchen"."recipe_ingredients" ("recipe_id", "position");
