-- Where a note sits on the Quilt canvas. The table was first made with
-- db:push, so existing installs already have it; new ones get it here.
CREATE TABLE IF NOT EXISTS janki.quilt_positions (
    owner_uid text NOT NULL,
    org_id text NOT NULL,
    x double precision NOT NULL,
    y double precision NOT NULL,
    pinned boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    angle double precision,
    band_t double precision,
    placed_ring integer,
    CONSTRAINT quilt_positions_pkey PRIMARY KEY (owner_uid, org_id)
);
