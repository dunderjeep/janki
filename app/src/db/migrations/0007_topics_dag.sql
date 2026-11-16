-- Drop old course infrastructure
ALTER TABLE "janki"."srs_decks" DROP COLUMN IF EXISTS "course_id";
DROP TABLE IF EXISTS "janki"."srs_courses";

-- Create srs_topics
CREATE TABLE "janki"."srs_topics" (
  "id" text PRIMARY KEY NOT NULL,
  "owner_uid" text NOT NULL,
  "name" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "color" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX "srs_topics_owner_idx" ON "janki"."srs_topics" ("owner_uid");

-- Create srs_topic_parents (DAG edges between topics)
CREATE TABLE "janki"."srs_topic_parents" (
  "topic_id" text NOT NULL REFERENCES "janki"."srs_topics"("id") ON DELETE CASCADE,
  "parent_id" text NOT NULL REFERENCES "janki"."srs_topics"("id") ON DELETE CASCADE,
  "sort_order" integer DEFAULT 0 NOT NULL,
  PRIMARY KEY ("topic_id", "parent_id")
);
CREATE INDEX "srs_topic_parents_parent_idx" ON "janki"."srs_topic_parents" ("parent_id");

-- Create srs_topic_decks (many-to-many topic↔deck)
CREATE TABLE "janki"."srs_topic_decks" (
  "topic_id" text NOT NULL REFERENCES "janki"."srs_topics"("id") ON DELETE CASCADE,
  "deck_id" text NOT NULL REFERENCES "janki"."srs_decks"("id") ON DELETE CASCADE,
  "sort_order" integer DEFAULT 0 NOT NULL,
  PRIMARY KEY ("topic_id", "deck_id")
);
CREATE INDEX "srs_topic_decks_deck_idx" ON "janki"."srs_topic_decks" ("deck_id");
