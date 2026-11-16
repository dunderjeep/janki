CREATE TABLE "janki"."graph_meta" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_uid" text NOT NULL,
	"key" text NOT NULL,
	"value" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "janki"."srs_card_states_due_idx";--> statement-breakpoint
ALTER TABLE "janki"."graph_edges" ADD COLUMN "from_port_id" text;--> statement-breakpoint
ALTER TABLE "janki"."graph_edges" ADD COLUMN "to_port_id" text;--> statement-breakpoint
ALTER TABLE "janki"."graph_edges" ADD COLUMN "occurred_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "janki"."graph_edges" ADD COLUMN "valid_from" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "janki"."graph_edges" ADD COLUMN "valid_to" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "janki"."graph_nodes" ADD COLUMN "occurred_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "janki"."graph_nodes" ADD COLUMN "valid_from" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "janki"."graph_nodes" ADD COLUMN "valid_to" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "graph_meta_owner_idx" ON "janki"."graph_meta" USING btree ("owner_uid");--> statement-breakpoint
CREATE UNIQUE INDEX "graph_meta_owner_key_uidx" ON "janki"."graph_meta" USING btree ("owner_uid","key");--> statement-breakpoint
CREATE INDEX "srs_card_states_due_idx" ON "janki"."srs_card_states" USING btree (janki.parse_due_at(srs));