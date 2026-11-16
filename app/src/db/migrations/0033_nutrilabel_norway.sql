-- The Norwegian (EU-format) label: Norwegian names and package lines, which
-- kind of label an ingredient was copied from, and which label the app opens on.
ALTER TABLE "nutrilabel"."ingredients" ADD COLUMN "label_no" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "nutrilabel"."ingredients" ADD COLUMN "label_format" text NOT NULL DEFAULT 'CA' CHECK ("label_format" IN ('CA', 'EU'));
--> statement-breakpoint
ALTER TABLE "nutrilabel"."products" ADD COLUMN "name_no" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "nutrilabel"."products" ADD COLUMN "hm_no" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "nutrilabel"."products" ADD COLUMN "storage_no" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "nutrilabel"."products" ADD COLUMN "durability_no" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "nutrilabel"."products" ADD COLUMN "allergy_note_no" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "nutrilabel"."products" ADD COLUMN "ingredients_no" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "nutrilabel"."products" ADD COLUMN "eu_portion" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "nutrilabel"."settings" ADD COLUMN "market" text NOT NULL DEFAULT 'CA' CHECK ("market" IN ('CA', 'NO'));
