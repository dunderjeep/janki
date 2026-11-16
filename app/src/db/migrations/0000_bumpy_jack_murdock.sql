CREATE SCHEMA "auth";
--> statement-breakpoint
CREATE SCHEMA "janki";
--> statement-breakpoint
CREATE TABLE "auth"."accounts" (
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "auth"."sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"email_verified" timestamp with time zone,
	"image" text,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "auth"."verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
CREATE TABLE "janki"."graph_edges" (
	"id" text PRIMARY KEY NOT NULL,
	"graph_id" text DEFAULT 'default' NOT NULL,
	"owner_uid" text NOT NULL,
	"type" text NOT NULL,
	"from_node_id" text NOT NULL,
	"to_node_id" text NOT NULL,
	"props" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "janki"."graph_nodes" (
	"id" text PRIMARY KEY NOT NULL,
	"graph_id" text DEFAULT 'default' NOT NULL,
	"owner_uid" text NOT NULL,
	"label" text NOT NULL,
	"props" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ui" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "janki"."srs_card_states" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_uid" text NOT NULL,
	"deck_id" text NOT NULL,
	"srs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "janki"."srs_cards" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_uid" text NOT NULL,
	"deck_id" text NOT NULL,
	"front" text NOT NULL,
	"back" text NOT NULL,
	"tags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"accepted" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"strict" boolean DEFAULT false NOT NULL,
	"image_url" text,
	"image_path" text,
	"audio_url" text,
	"audio_path" text,
	"import_key" text,
	"node_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "janki"."srs_decks" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_uid" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"fsrs_params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"node_id" text,
	"default_topic_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "janki"."srs_reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_uid" text NOT NULL,
	"session_id" text,
	"deck_id" text NOT NULL,
	"card_id" text NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"grade" text NOT NULL,
	"transcript" text DEFAULT '' NOT NULL,
	"raw_answer" text DEFAULT '' NOT NULL,
	"correct" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "janki"."srs_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_uid" text NOT NULL,
	"deck_id" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"target_count" integer DEFAULT 20 NOT NULL,
	"card_ids" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"progress" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "janki"."srs_streaks" (
	"id" text PRIMARY KEY NOT NULL,
	"streak_count" integer DEFAULT 0 NOT NULL,
	"longest_streak" integer DEFAULT 0 NOT NULL,
	"last_study_date" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth"."accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "janki"."graph_edges" ADD CONSTRAINT "graph_edges_from_node_id_graph_nodes_id_fk" FOREIGN KEY ("from_node_id") REFERENCES "janki"."graph_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "janki"."graph_edges" ADD CONSTRAINT "graph_edges_to_node_id_graph_nodes_id_fk" FOREIGN KEY ("to_node_id") REFERENCES "janki"."graph_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "janki"."srs_card_states" ADD CONSTRAINT "srs_card_states_id_srs_cards_id_fk" FOREIGN KEY ("id") REFERENCES "janki"."srs_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "janki"."srs_cards" ADD CONSTRAINT "srs_cards_deck_id_srs_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "janki"."srs_decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "janki"."srs_reviews" ADD CONSTRAINT "srs_reviews_card_id_srs_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "janki"."srs_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "graph_edges_from_idx" ON "janki"."graph_edges" USING btree ("from_node_id");--> statement-breakpoint
CREATE INDEX "graph_edges_to_idx" ON "janki"."graph_edges" USING btree ("to_node_id");--> statement-breakpoint
CREATE INDEX "graph_edges_owner_idx" ON "janki"."graph_edges" USING btree ("owner_uid");--> statement-breakpoint
CREATE INDEX "graph_edges_type_idx" ON "janki"."graph_edges" USING btree ("type","from_node_id");--> statement-breakpoint
CREATE INDEX "graph_nodes_owner_idx" ON "janki"."graph_nodes" USING btree ("owner_uid");--> statement-breakpoint
CREATE INDEX "graph_nodes_graph_owner_idx" ON "janki"."graph_nodes" USING btree ("graph_id","owner_uid");--> statement-breakpoint
CREATE INDEX "srs_card_states_deck_idx" ON "janki"."srs_card_states" USING btree ("deck_id");--> statement-breakpoint
CREATE INDEX "srs_card_states_owner_idx" ON "janki"."srs_card_states" USING btree ("owner_uid");--> statement-breakpoint
-- IMMUTABLE wrapper required for expression index on JSONB timestamp field:
CREATE OR REPLACE FUNCTION janki.parse_due_at(srs jsonb)
  RETURNS timestamp LANGUAGE sql IMMUTABLE STRICT AS
  $$ SELECT (srs->>'dueAt')::timestamp $$;
CREATE INDEX "srs_card_states_due_idx" ON "janki"."srs_card_states" USING btree (janki.parse_due_at(srs));--> statement-breakpoint
CREATE INDEX "srs_cards_deck_idx" ON "janki"."srs_cards" USING btree ("deck_id");--> statement-breakpoint
CREATE INDEX "srs_cards_owner_idx" ON "janki"."srs_cards" USING btree ("owner_uid");--> statement-breakpoint
CREATE UNIQUE INDEX "srs_cards_import_key_uidx" ON "janki"."srs_cards" USING btree ("deck_id","import_key") WHERE import_key IS NOT NULL;--> statement-breakpoint
CREATE INDEX "srs_decks_owner_idx" ON "janki"."srs_decks" USING btree ("owner_uid");--> statement-breakpoint
CREATE INDEX "srs_reviews_card_idx" ON "janki"."srs_reviews" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "srs_reviews_owner_idx" ON "janki"."srs_reviews" USING btree ("owner_uid");--> statement-breakpoint
CREATE INDEX "srs_reviews_session_idx" ON "janki"."srs_reviews" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "srs_reviews_date_idx" ON "janki"."srs_reviews" USING btree ("owner_uid","reviewed_at");--> statement-breakpoint
CREATE INDEX "srs_sessions_owner_idx" ON "janki"."srs_sessions" USING btree ("owner_uid");--> statement-breakpoint
CREATE INDEX "srs_sessions_deck_idx" ON "janki"."srs_sessions" USING btree ("deck_id");--> statement-breakpoint
CREATE INDEX "srs_sessions_active_idx" ON "janki"."srs_sessions" USING btree ("owner_uid","status");