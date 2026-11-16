-- Where you were in a work: the selected binder item and view. Kept on the
-- server, not in localStorage, so it survives a change of origin (localhost vs
-- the tailnet name) and follows you between devices.
ALTER TABLE "scatterbrain"."works" ADD COLUMN "last_item_id" text;
--> statement-breakpoint
ALTER TABLE "scatterbrain"."works" ADD COLUMN "last_view" text;
