-- Talking a draft through with Claude, and the facts about yourself that come
-- out of it. A fact you save becomes source material for every later draft.
CREATE TABLE "jobbi"."doc_messages" (
  "id" text PRIMARY KEY,
  "owner_uid" text NOT NULL,
  "document_id" text NOT NULL,
  "role" text NOT NULL CHECK ("role" IN ('user', 'assistant')),
  "content" text NOT NULL,
  "proposal" jsonb,
  "applied_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "jobbi_doc_messages_doc_idx" ON "jobbi"."doc_messages" ("owner_uid", "document_id", "created_at");
--> statement-breakpoint
CREATE TABLE "jobbi"."facts" (
  "id" text PRIMARY KEY,
  "owner_uid" text NOT NULL,
  "text" text NOT NULL,
  "source_document_id" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "jobbi_facts_owner_idx" ON "jobbi"."facts" ("owner_uid", "created_at");
