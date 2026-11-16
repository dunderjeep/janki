-- Align constraint and index names with drizzle's own convention.
--
-- Migrations 0007-0011 were hand-written, so Postgres named their foreign keys
-- `*_fkey` and their primary keys `*_pkey`, where drizzle-kit generates `*_fk`
-- and `*_..._pk`. The schema was correct but every `db:generate` re-emitted
-- this same churn as if it were a real change. Renaming once makes future
-- generated migrations minimal and honest.
--
-- Semantically a no-op: no table, column or row is touched — only the names of
-- constraints and indexes, plus array defaults restated as ARRAY[]::text[].

ALTER TABLE "janki"."course_chapters" DROP CONSTRAINT "course_chapters_book_id_fkey";
--> statement-breakpoint
ALTER TABLE "janki"."course_chapters" DROP CONSTRAINT "course_chapters_deck_id_fkey";
--> statement-breakpoint
ALTER TABLE "janki"."course_sections" DROP CONSTRAINT "course_sections_chapter_id_fkey";
--> statement-breakpoint
ALTER TABLE "janki"."course_problems" DROP CONSTRAINT "course_problems_section_id_fkey";
--> statement-breakpoint
ALTER TABLE "janki"."course_problems" DROP CONSTRAINT "course_problems_parent_id_fkey";
--> statement-breakpoint
ALTER TABLE "janki"."course_problem_attempts" DROP CONSTRAINT "course_problem_attempts_problem_id_fkey";
--> statement-breakpoint
ALTER TABLE "janki"."course_section_blocks" DROP CONSTRAINT "course_section_blocks_section_id_fkey";
--> statement-breakpoint
ALTER TABLE "janki"."course_annotations" DROP CONSTRAINT "course_annotations_block_id_fkey";
--> statement-breakpoint
ALTER TABLE "janki"."course_annotations" DROP CONSTRAINT "course_annotations_card_id_fkey";
--> statement-breakpoint
ALTER TABLE "janki"."course_clarifications" DROP CONSTRAINT "course_clarifications_block_id_fkey";
--> statement-breakpoint
ALTER TABLE "janki"."srs_topic_parents" DROP CONSTRAINT "srs_topic_parents_topic_id_fkey";
--> statement-breakpoint
ALTER TABLE "janki"."srs_topic_parents" DROP CONSTRAINT "srs_topic_parents_parent_id_fkey";
--> statement-breakpoint
ALTER TABLE "janki"."course_problem_cards" DROP CONSTRAINT "course_problem_cards_problem_id_fkey";
--> statement-breakpoint
ALTER TABLE "janki"."course_problem_cards" DROP CONSTRAINT "course_problem_cards_card_id_fkey";
--> statement-breakpoint
ALTER TABLE "janki"."course_chapter_gates" DROP CONSTRAINT "course_chapter_gates_chapter_id_fkey";
--> statement-breakpoint
ALTER TABLE "janki"."course_chapter_gates" DROP CONSTRAINT "course_chapter_gates_card_id_fkey";
--> statement-breakpoint
ALTER TABLE "janki"."srs_topic_decks" DROP CONSTRAINT "srs_topic_decks_topic_id_fkey";
--> statement-breakpoint
ALTER TABLE "janki"."srs_topic_decks" DROP CONSTRAINT "srs_topic_decks_deck_id_fkey";
--> statement-breakpoint
DROP INDEX "janki"."graph_meta_owner_idx";--> statement-breakpoint
DROP INDEX "janki"."graph_meta_owner_key_uidx";--> statement-breakpoint
DROP INDEX "janki"."graph_edges_from_idx";--> statement-breakpoint
DROP INDEX "janki"."graph_edges_owner_idx";--> statement-breakpoint
DROP INDEX "janki"."graph_edges_to_idx";--> statement-breakpoint
DROP INDEX "janki"."graph_edges_type_idx";--> statement-breakpoint
DROP INDEX "janki"."graph_nodes_graph_owner_idx";--> statement-breakpoint
DROP INDEX "janki"."graph_nodes_owner_idx";--> statement-breakpoint
DROP INDEX "janki"."srs_cards_deck_idx";--> statement-breakpoint
DROP INDEX "janki"."srs_cards_import_key_uidx";--> statement-breakpoint
DROP INDEX "janki"."srs_cards_owner_idx";--> statement-breakpoint
DROP INDEX "janki"."srs_decks_owner_idx";--> statement-breakpoint
DROP INDEX "janki"."srs_topics_owner_idx";--> statement-breakpoint
DROP INDEX "janki"."course_books_owner_idx";--> statement-breakpoint
DROP INDEX "janki"."course_chapters_book_idx";--> statement-breakpoint
DROP INDEX "janki"."course_chapters_book_number_uidx";--> statement-breakpoint
DROP INDEX "janki"."course_sections_chapter_idx";--> statement-breakpoint
DROP INDEX "janki"."course_problems_parent_idx";--> statement-breakpoint
DROP INDEX "janki"."course_problems_section_idx";--> statement-breakpoint
DROP INDEX "janki"."course_problem_attempts_owner_idx";--> statement-breakpoint
DROP INDEX "janki"."course_problem_attempts_problem_idx";--> statement-breakpoint
DROP INDEX "janki"."course_section_blocks_section_idx";--> statement-breakpoint
DROP INDEX "janki"."course_annotations_block_idx";--> statement-breakpoint
DROP INDEX "janki"."course_annotations_card_idx";--> statement-breakpoint
DROP INDEX "janki"."course_annotations_owner_idx";--> statement-breakpoint
DROP INDEX "janki"."course_clarifications_block_idx";--> statement-breakpoint
DROP INDEX "janki"."course_clarifications_owner_idx";--> statement-breakpoint
DROP INDEX "janki"."srs_reviews_card_idx";--> statement-breakpoint
DROP INDEX "janki"."srs_reviews_date_idx";--> statement-breakpoint
DROP INDEX "janki"."srs_reviews_owner_idx";--> statement-breakpoint
DROP INDEX "janki"."srs_reviews_session_idx";--> statement-breakpoint
DROP INDEX "janki"."srs_sessions_active_idx";--> statement-breakpoint
DROP INDEX "janki"."srs_sessions_deck_idx";--> statement-breakpoint
DROP INDEX "janki"."srs_sessions_owner_idx";--> statement-breakpoint
DROP INDEX "janki"."srs_card_states_deck_idx";--> statement-breakpoint
DROP INDEX "janki"."srs_card_states_due_idx";--> statement-breakpoint
DROP INDEX "janki"."srs_card_states_owner_idx";--> statement-breakpoint
DROP INDEX "janki"."srs_topic_parents_parent_idx";--> statement-breakpoint
DROP INDEX "janki"."course_problem_cards_card_idx";--> statement-breakpoint
DROP INDEX "janki"."course_chapter_gates_card_idx";--> statement-breakpoint
DROP INDEX "janki"."srs_topic_decks_deck_idx";--> statement-breakpoint
ALTER TABLE "janki"."srs_topic_parents" DROP CONSTRAINT "srs_topic_parents_pkey";--> statement-breakpoint
ALTER TABLE "janki"."course_problem_cards" DROP CONSTRAINT "course_problem_cards_pkey";--> statement-breakpoint
ALTER TABLE "janki"."course_chapter_gates" DROP CONSTRAINT "course_chapter_gates_pkey";--> statement-breakpoint
ALTER TABLE "janki"."srs_topic_decks" DROP CONSTRAINT "srs_topic_decks_pkey";--> statement-breakpoint
ALTER TABLE "janki"."activity_streaks" DROP CONSTRAINT "activity_streaks_pkey";--> statement-breakpoint
ALTER TABLE "janki"."srs_cards" ALTER COLUMN "tags" SET DEFAULT ARRAY[]::text[];--> statement-breakpoint
ALTER TABLE "janki"."srs_cards" ALTER COLUMN "accepted" SET DEFAULT ARRAY[]::text[];--> statement-breakpoint
ALTER TABLE "janki"."course_problems" ALTER COLUMN "technique_tags" SET DEFAULT ARRAY[]::text[];--> statement-breakpoint
ALTER TABLE "auth"."users" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "janki"."srs_sessions" ALTER COLUMN "card_ids" SET DEFAULT ARRAY[]::text[];--> statement-breakpoint
ALTER TABLE "janki"."srs_topic_parents" ADD CONSTRAINT "srs_topic_parents_topic_id_parent_id_pk" PRIMARY KEY("topic_id","parent_id");--> statement-breakpoint
ALTER TABLE "janki"."course_problem_cards" ADD CONSTRAINT "course_problem_cards_problem_id_card_id_pk" PRIMARY KEY("problem_id","card_id");--> statement-breakpoint
ALTER TABLE "janki"."course_chapter_gates" ADD CONSTRAINT "course_chapter_gates_chapter_id_card_id_pk" PRIMARY KEY("chapter_id","card_id");--> statement-breakpoint
ALTER TABLE "janki"."srs_topic_decks" ADD CONSTRAINT "srs_topic_decks_topic_id_deck_id_pk" PRIMARY KEY("topic_id","deck_id");--> statement-breakpoint
ALTER TABLE "janki"."activity_streaks" ADD CONSTRAINT "activity_streaks_owner_uid_activity_pk" PRIMARY KEY("owner_uid","activity");--> statement-breakpoint
ALTER TABLE "janki"."course_chapters" ADD CONSTRAINT "course_chapters_book_id_course_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "janki"."course_books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "janki"."course_chapters" ADD CONSTRAINT "course_chapters_deck_id_srs_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "janki"."srs_decks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "janki"."course_sections" ADD CONSTRAINT "course_sections_chapter_id_course_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "janki"."course_chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "janki"."course_problems" ADD CONSTRAINT "course_problems_section_id_course_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "janki"."course_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "janki"."course_problem_attempts" ADD CONSTRAINT "course_problem_attempts_problem_id_course_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "janki"."course_problems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "janki"."course_section_blocks" ADD CONSTRAINT "course_section_blocks_section_id_course_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "janki"."course_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "janki"."course_annotations" ADD CONSTRAINT "course_annotations_block_id_course_section_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "janki"."course_section_blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "janki"."course_annotations" ADD CONSTRAINT "course_annotations_card_id_srs_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "janki"."srs_cards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "janki"."course_clarifications" ADD CONSTRAINT "course_clarifications_block_id_course_section_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "janki"."course_section_blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "janki"."srs_topic_parents" ADD CONSTRAINT "srs_topic_parents_topic_id_srs_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "janki"."srs_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "janki"."srs_topic_parents" ADD CONSTRAINT "srs_topic_parents_parent_id_srs_topics_id_fk" FOREIGN KEY ("parent_id") REFERENCES "janki"."srs_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "janki"."course_problem_cards" ADD CONSTRAINT "course_problem_cards_problem_id_course_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "janki"."course_problems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "janki"."course_problem_cards" ADD CONSTRAINT "course_problem_cards_card_id_srs_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "janki"."srs_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "janki"."course_chapter_gates" ADD CONSTRAINT "course_chapter_gates_chapter_id_course_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "janki"."course_chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "janki"."course_chapter_gates" ADD CONSTRAINT "course_chapter_gates_card_id_srs_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "janki"."srs_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "janki"."srs_topic_decks" ADD CONSTRAINT "srs_topic_decks_topic_id_srs_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "janki"."srs_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "janki"."srs_topic_decks" ADD CONSTRAINT "srs_topic_decks_deck_id_srs_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "janki"."srs_decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "graph_meta_owner_idx" ON "janki"."graph_meta" USING btree ("owner_uid");--> statement-breakpoint
CREATE UNIQUE INDEX "graph_meta_owner_key_uidx" ON "janki"."graph_meta" USING btree ("owner_uid","key");--> statement-breakpoint
CREATE INDEX "graph_edges_from_idx" ON "janki"."graph_edges" USING btree ("from_node_id");--> statement-breakpoint
CREATE INDEX "graph_edges_owner_idx" ON "janki"."graph_edges" USING btree ("owner_uid");--> statement-breakpoint
CREATE INDEX "graph_edges_to_idx" ON "janki"."graph_edges" USING btree ("to_node_id");--> statement-breakpoint
CREATE INDEX "graph_edges_type_idx" ON "janki"."graph_edges" USING btree ("type","from_node_id");--> statement-breakpoint
CREATE INDEX "graph_nodes_graph_owner_idx" ON "janki"."graph_nodes" USING btree ("graph_id","owner_uid");--> statement-breakpoint
CREATE INDEX "graph_nodes_owner_idx" ON "janki"."graph_nodes" USING btree ("owner_uid");--> statement-breakpoint
CREATE INDEX "srs_cards_deck_idx" ON "janki"."srs_cards" USING btree ("deck_id");--> statement-breakpoint
CREATE UNIQUE INDEX "srs_cards_import_key_uidx" ON "janki"."srs_cards" USING btree ("deck_id","import_key") WHERE import_key IS NOT NULL;--> statement-breakpoint
CREATE INDEX "srs_cards_owner_idx" ON "janki"."srs_cards" USING btree ("owner_uid");--> statement-breakpoint
CREATE INDEX "srs_decks_owner_idx" ON "janki"."srs_decks" USING btree ("owner_uid");--> statement-breakpoint
CREATE INDEX "srs_topics_owner_idx" ON "janki"."srs_topics" USING btree ("owner_uid");--> statement-breakpoint
CREATE INDEX "course_books_owner_idx" ON "janki"."course_books" USING btree ("owner_uid");--> statement-breakpoint
CREATE INDEX "course_chapters_book_idx" ON "janki"."course_chapters" USING btree ("book_id");--> statement-breakpoint
CREATE UNIQUE INDEX "course_chapters_book_number_uidx" ON "janki"."course_chapters" USING btree ("book_id","number");--> statement-breakpoint
CREATE INDEX "course_sections_chapter_idx" ON "janki"."course_sections" USING btree ("chapter_id");--> statement-breakpoint
CREATE INDEX "course_problems_parent_idx" ON "janki"."course_problems" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "course_problems_section_idx" ON "janki"."course_problems" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "course_problem_attempts_owner_idx" ON "janki"."course_problem_attempts" USING btree ("owner_uid");--> statement-breakpoint
CREATE INDEX "course_problem_attempts_problem_idx" ON "janki"."course_problem_attempts" USING btree ("problem_id");--> statement-breakpoint
CREATE INDEX "course_section_blocks_section_idx" ON "janki"."course_section_blocks" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "course_annotations_block_idx" ON "janki"."course_annotations" USING btree ("block_id");--> statement-breakpoint
CREATE INDEX "course_annotations_card_idx" ON "janki"."course_annotations" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "course_annotations_owner_idx" ON "janki"."course_annotations" USING btree ("owner_uid");--> statement-breakpoint
CREATE INDEX "course_clarifications_block_idx" ON "janki"."course_clarifications" USING btree ("block_id");--> statement-breakpoint
CREATE INDEX "course_clarifications_owner_idx" ON "janki"."course_clarifications" USING btree ("owner_uid");--> statement-breakpoint
CREATE INDEX "srs_reviews_card_idx" ON "janki"."srs_reviews" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "srs_reviews_date_idx" ON "janki"."srs_reviews" USING btree ("owner_uid","reviewed_at");--> statement-breakpoint
CREATE INDEX "srs_reviews_owner_idx" ON "janki"."srs_reviews" USING btree ("owner_uid");--> statement-breakpoint
CREATE INDEX "srs_reviews_session_idx" ON "janki"."srs_reviews" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "srs_sessions_active_idx" ON "janki"."srs_sessions" USING btree ("owner_uid","status");--> statement-breakpoint
CREATE INDEX "srs_sessions_deck_idx" ON "janki"."srs_sessions" USING btree ("deck_id");--> statement-breakpoint
CREATE INDEX "srs_sessions_owner_idx" ON "janki"."srs_sessions" USING btree ("owner_uid");--> statement-breakpoint
CREATE INDEX "srs_card_states_deck_idx" ON "janki"."srs_card_states" USING btree ("deck_id");--> statement-breakpoint
CREATE INDEX "srs_card_states_due_idx" ON "janki"."srs_card_states" USING btree (janki.parse_due_at(srs));--> statement-breakpoint
CREATE INDEX "srs_card_states_owner_idx" ON "janki"."srs_card_states" USING btree ("owner_uid");--> statement-breakpoint
CREATE INDEX "srs_topic_parents_parent_idx" ON "janki"."srs_topic_parents" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "course_problem_cards_card_idx" ON "janki"."course_problem_cards" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "course_chapter_gates_card_idx" ON "janki"."course_chapter_gates" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "srs_topic_decks_deck_idx" ON "janki"."srs_topic_decks" USING btree ("deck_id");