-- NutriLabel's tables. janki applies the same DDL as its migration 0032_nutrilabel.sql.
CREATE SCHEMA IF NOT EXISTS "nutrilabel";

CREATE TABLE "nutrilabel"."ingredients" (
  "id" text PRIMARY KEY,
  "owner_uid" text NOT NULL,
  "name" text NOT NULL,
  "label_en" text NOT NULL DEFAULT '',
  "label_fr" text NOT NULL DEFAULT '',
  -- Label | CNF | USDA | Lab | Custom
  "source" text NOT NULL DEFAULT 'Label',
  "printed" text NOT NULL DEFAULT '',
  "serving_amount" numeric,
  "serving_unit" text NOT NULL DEFAULT 'g' CHECK ("serving_unit" IN ('g', 'mL')),
  "g_per_ml" numeric,
  -- Per serving as printed: {"cal": 130, "fat": 5, ..., "iron": null}; null = left blank.
  "nutrients" jsonb NOT NULL DEFAULT '{}',
  "allergens" text[] NOT NULL DEFAULT '{}',
  "notes" text NOT NULL DEFAULT '',
  "cnf_code" integer,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "nutrilabel_ingredients_name_idx" ON "nutrilabel"."ingredients" ("owner_uid", "name");

CREATE TABLE "nutrilabel"."products" (
  "id" text PRIMARY KEY,
  "owner_uid" text NOT NULL,
  "name" text NOT NULL,
  "name_en" text NOT NULL DEFAULT '',
  "name_fr" text NOT NULL DEFAULT '',
  "price" text NOT NULL DEFAULT '',
  "net_quantity" text NOT NULL DEFAULT '',
  -- Item in Health Canada's Table of Reference Amounts, e.g. 'E.1'.
  "ra_item" text NOT NULL DEFAULT '',
  "hm_en" text NOT NULL DEFAULT '',
  "hm_fr" text NOT NULL DEFAULT '',
  "mm" numeric,
  "mm_unit" text NOT NULL DEFAULT 'g' CHECK ("mm_unit" IN ('g', 'mL')),
  "serving_weight_g" numeric,
  "batch_weight_g" numeric,
  "contains_en" text NOT NULL DEFAULT '',
  "contains_fr" text NOT NULL DEFAULT '',
  "storage_en" text NOT NULL DEFAULT '',
  "storage_fr" text NOT NULL DEFAULT '',
  "prepared_by" text NOT NULL DEFAULT '',
  "ingredients_en" text NOT NULL DEFAULT '',
  "ingredients_fr" text NOT NULL DEFAULT '',
  "notes" text NOT NULL DEFAULT '',
  "source_ref" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "nutrilabel_products_name_idx" ON "nutrilabel"."products" ("owner_uid", "name");

CREATE TABLE "nutrilabel"."product_lines" (
  "id" text PRIMARY KEY,
  "product_id" text NOT NULL REFERENCES "nutrilabel"."products" ("id") ON DELETE CASCADE,
  "position" integer NOT NULL,
  -- RESTRICT: deleting an ingredient in use would silently change a label.
  "ingredient_id" text NOT NULL REFERENCES "nutrilabel"."ingredients" ("id") ON DELETE RESTRICT,
  "grams" numeric CHECK ("grams" >= 0)
);
CREATE INDEX "nutrilabel_lines_product_idx" ON "nutrilabel"."product_lines" ("product_id", "position");
CREATE INDEX "nutrilabel_lines_ingredient_idx" ON "nutrilabel"."product_lines" ("ingredient_id");

CREATE TABLE "nutrilabel"."settings" (
  "owner_uid" text PRIMARY KEY,
  "business_name" text NOT NULL DEFAULT '',
  "address" text NOT NULL DEFAULT '',
  "contact" text NOT NULL DEFAULT '',
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
