CREATE TABLE "janki"."srs_courses" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_uid" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "janki"."srs_decks" ADD COLUMN "course_id" text;--> statement-breakpoint
CREATE INDEX "srs_courses_owner_idx" ON "janki"."srs_courses" USING btree ("owner_uid");--> statement-breakpoint
ALTER TABLE "janki"."srs_decks" ADD CONSTRAINT "srs_decks_course_id_srs_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "janki"."srs_courses"("id") ON DELETE set null ON UPDATE no action;