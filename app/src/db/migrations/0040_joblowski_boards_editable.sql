-- Every job board link is now the person's own row, editable and removable:
-- the standard boards are copied in once (boards_seeded records that), so
-- removing one keeps it removed. section groups them, position orders them,
-- and quick ones also show under the search box.
ALTER TABLE joblowski.boards ADD COLUMN IF NOT EXISTS section text NOT NULL DEFAULT 'Your links';
--> statement-breakpoint
ALTER TABLE joblowski.boards ADD COLUMN IF NOT EXISTS note text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE joblowski.boards ADD COLUMN IF NOT EXISTS quick boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE joblowski.boards ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0;
--> statement-breakpoint
UPDATE joblowski.boards b SET position = 1000 + o.n
FROM (SELECT id, row_number() OVER (PARTITION BY owner_uid ORDER BY created_at) AS n FROM joblowski.boards) o
WHERE b.id = o.id;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS joblowski.boards_seeded (
    owner_uid text PRIMARY KEY,
    seeded_at timestamp with time zone DEFAULT now() NOT NULL
);
