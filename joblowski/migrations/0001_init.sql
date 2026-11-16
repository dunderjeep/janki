-- Joblowski's tables, for a fresh database (the standalone app).
-- janki reaches the same schema through its own migrations 0018-0030.
-- Taken from pg_dump of janki's database on 2026-11-12, then tidied.


CREATE SCHEMA joblowski;

CREATE TABLE joblowski.applications (
    id text NOT NULL,
    owner_uid text NOT NULL,
    company text NOT NULL,
    role text NOT NULL,
    url text,
    location text,
    status text DEFAULT 'saved'::text NOT NULL,
    date_applied date,
    due_date date,
    notes text DEFAULT ''::text NOT NULL,
    source text,
    resume_revision_id text,
    letter_revision_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    posting text DEFAULT ''::text NOT NULL,
    address text,
    lat double precision,
    lon double precision,
    category text,
    parked_until date,
    CONSTRAINT applications_status_check CHECK ((status = ANY (ARRAY['saved'::text, 'applied'::text, 'interview'::text, 'offer'::text, 'rejected'::text, 'withdrawn'::text, 'parked'::text])))
);

CREATE TABLE joblowski.boards (
    id text NOT NULL,
    owner_uid text NOT NULL,
    name text NOT NULL,
    url_template text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE joblowski.dismissed (
    owner_uid text NOT NULL,
    ad_key text NOT NULL,
    title text NOT NULL,
    company text NOT NULL,
    dismissed_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE joblowski.doc_messages (
    id text NOT NULL,
    owner_uid text NOT NULL,
    document_id text NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    proposal jsonb,
    applied_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT doc_messages_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text])))
);

CREATE TABLE joblowski.documents (
    id text NOT NULL,
    owner_uid text NOT NULL,
    kind text NOT NULL,
    name text NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    style text DEFAULT 'classic'::text NOT NULL,
    derived_from text,
    archived_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    ai_notes jsonb,
    CONSTRAINT documents_kind_check CHECK ((kind = ANY (ARRAY['resume'::text, 'letter'::text]))),
    CONSTRAINT documents_style_check CHECK ((style = ANY (ARRAY['classic'::text, 'modern'::text])))
);

CREATE TABLE joblowski.facts (
    id text NOT NULL,
    owner_uid text NOT NULL,
    text text NOT NULL,
    source_document_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE joblowski.hits (
    search_id text NOT NULL,
    listing_id text NOT NULL,
    owner_uid text NOT NULL,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    seen_at timestamp with time zone
);

CREATE TABLE joblowski.listings (
    id text NOT NULL,
    source text NOT NULL,
    title text NOT NULL,
    company text DEFAULT ''::text NOT NULL,
    location text DEFAULT ''::text NOT NULL,
    remote boolean DEFAULT false NOT NULL,
    url text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    tags text DEFAULT ''::text NOT NULL,
    salary text,
    published_at timestamp with time zone,
    expires_on date,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    search tsvector GENERATED ALWAYS AS (to_tsvector('simple'::regconfig, ((((((title || ' '::text) || company) || ' '::text) || tags) || ' '::text) || description))) STORED,
    ad_key text GENERATED ALWAYS AS (lower(regexp_replace((title || company), '[^[:alnum:]]+'::text, ''::text, 'g'::text))) STORED,
    language text,
    pay_min double precision,
    pay_max double precision,
    pay_currency text,
    pay_period text
);

CREATE TABLE joblowski.map_home (
    owner_uid text NOT NULL,
    address text NOT NULL,
    lat double precision NOT NULL,
    lon double precision NOT NULL
);

CREATE TABLE joblowski.rates (
    currency text NOT NULL,
    nok double precision NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE joblowski.revisions (
    id text NOT NULL,
    document_id text NOT NULL,
    owner_uid text NOT NULL,
    name text NOT NULL,
    body text NOT NULL,
    style text NOT NULL,
    sha256 text NOT NULL,
    label text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE joblowski.saved_searches (
    id text NOT NULL,
    owner_uid text NOT NULL,
    name text NOT NULL,
    query text DEFAULT ''::text NOT NULL,
    location text DEFAULT ''::text NOT NULL,
    sources text[] NOT NULL,
    alert boolean DEFAULT true NOT NULL,
    last_run_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    filters jsonb DEFAULT '{}'::jsonb NOT NULL,
    rank integer DEFAULT 0 NOT NULL
);

CREATE TABLE joblowski.source_state (
    source text NOT NULL,
    last_attempt_at timestamp with time zone,
    fetched_at timestamp with time zone,
    last_count integer,
    last_error text
);

CREATE TABLE joblowski.status_events (
    id text NOT NULL,
    application_id text NOT NULL,
    owner_uid text NOT NULL,
    status text,
    at timestamp with time zone DEFAULT now() NOT NULL,
    note text,
    CONSTRAINT status_events_status_or_note CHECK (((status IS NOT NULL) OR (note IS NOT NULL)))
);

CREATE TABLE joblowski.walks (
    id text NOT NULL,
    owner_uid text NOT NULL,
    name text NOT NULL,
    stop_ids text[] DEFAULT '{}'::text[] NOT NULL,
    route jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY joblowski.applications
    ADD CONSTRAINT applications_pkey PRIMARY KEY (id);

ALTER TABLE ONLY joblowski.boards
    ADD CONSTRAINT boards_pkey PRIMARY KEY (id);

ALTER TABLE ONLY joblowski.dismissed
    ADD CONSTRAINT dismissed_pkey PRIMARY KEY (owner_uid, ad_key);

ALTER TABLE ONLY joblowski.doc_messages
    ADD CONSTRAINT doc_messages_pkey PRIMARY KEY (id);

ALTER TABLE ONLY joblowski.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);

ALTER TABLE ONLY joblowski.facts
    ADD CONSTRAINT facts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY joblowski.hits
    ADD CONSTRAINT hits_pkey PRIMARY KEY (search_id, listing_id);

ALTER TABLE ONLY joblowski.listings
    ADD CONSTRAINT listings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY joblowski.map_home
    ADD CONSTRAINT map_home_pkey PRIMARY KEY (owner_uid);

ALTER TABLE ONLY joblowski.rates
    ADD CONSTRAINT rates_pkey PRIMARY KEY (currency);

ALTER TABLE ONLY joblowski.revisions
    ADD CONSTRAINT revisions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY joblowski.saved_searches
    ADD CONSTRAINT saved_searches_pkey PRIMARY KEY (id);

ALTER TABLE ONLY joblowski.source_state
    ADD CONSTRAINT source_state_pkey PRIMARY KEY (source);

ALTER TABLE ONLY joblowski.status_events
    ADD CONSTRAINT status_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY joblowski.walks
    ADD CONSTRAINT walks_pkey PRIMARY KEY (id);

CREATE INDEX joblowski_applications_owner_idx ON joblowski.applications USING btree (owner_uid, created_at DESC);

CREATE UNIQUE INDEX joblowski_applications_owner_url_unique ON joblowski.applications USING btree (owner_uid, url) WHERE (url IS NOT NULL);

CREATE INDEX joblowski_boards_owner_idx ON joblowski.boards USING btree (owner_uid, created_at);

CREATE INDEX joblowski_doc_messages_doc_idx ON joblowski.doc_messages USING btree (owner_uid, document_id, created_at);

CREATE INDEX joblowski_documents_owner_idx ON joblowski.documents USING btree (owner_uid, kind, updated_at DESC);

CREATE INDEX joblowski_facts_owner_idx ON joblowski.facts USING btree (owner_uid, created_at);

CREATE INDEX joblowski_hits_unseen_idx ON joblowski.hits USING btree (owner_uid) WHERE (seen_at IS NULL);

CREATE INDEX joblowski_listings_last_seen_idx ON joblowski.listings USING btree (last_seen_at);

CREATE INDEX joblowski_listings_published_idx ON joblowski.listings USING btree (published_at DESC NULLS LAST);

CREATE INDEX joblowski_listings_search_idx ON joblowski.listings USING gin (search);

CREATE INDEX joblowski_revisions_document_idx ON joblowski.revisions USING btree (document_id, created_at DESC);

CREATE INDEX joblowski_saved_searches_owner_idx ON joblowski.saved_searches USING btree (owner_uid, created_at);

CREATE INDEX joblowski_status_events_application_idx ON joblowski.status_events USING btree (application_id, at);

CREATE INDEX joblowski_walks_owner_idx ON joblowski.walks USING btree (owner_uid, updated_at);

ALTER TABLE ONLY joblowski.applications
    ADD CONSTRAINT applications_letter_revision_id_fkey FOREIGN KEY (letter_revision_id) REFERENCES joblowski.revisions(id) ON DELETE RESTRICT;

ALTER TABLE ONLY joblowski.applications
    ADD CONSTRAINT applications_resume_revision_id_fkey FOREIGN KEY (resume_revision_id) REFERENCES joblowski.revisions(id) ON DELETE RESTRICT;

ALTER TABLE ONLY joblowski.documents
    ADD CONSTRAINT documents_derived_from_fkey FOREIGN KEY (derived_from) REFERENCES joblowski.documents(id) ON DELETE SET NULL;

ALTER TABLE ONLY joblowski.hits
    ADD CONSTRAINT hits_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES joblowski.listings(id) ON DELETE CASCADE;

ALTER TABLE ONLY joblowski.hits
    ADD CONSTRAINT hits_search_id_fkey FOREIGN KEY (search_id) REFERENCES joblowski.saved_searches(id) ON DELETE CASCADE;

ALTER TABLE ONLY joblowski.revisions
    ADD CONSTRAINT revisions_document_id_fkey FOREIGN KEY (document_id) REFERENCES joblowski.documents(id) ON DELETE CASCADE;

ALTER TABLE ONLY joblowski.status_events
    ADD CONSTRAINT status_events_application_id_fkey FOREIGN KEY (application_id) REFERENCES joblowski.applications(id) ON DELETE CASCADE;


-- Starting currency rates for showing pay in NOK; edit them on the Search tab.
INSERT INTO joblowski.rates (currency, nok) VALUES
  ('NOK', 1), ('USD', 10.5), ('EUR', 11.6), ('GBP', 13.5), ('CAD', 7.5), ('SEK', 1.05), ('DKK', 1.55), ('CHF', 12.6);
