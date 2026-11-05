-- Aggregate JSONB persistence keeps contacts, properties, opportunities and their IDs
-- separate; the single workspace row serializes mutations with SELECT FOR UPDATE.
-- This is intentionally single-organization. Do not expose the database to clients.
CREATE TABLE IF NOT EXISTS workspace (
 id integer PRIMARY KEY CHECK (id = 1),
 data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object')
);
CREATE TABLE IF NOT EXISTS sessions_rate (key text PRIMARY KEY, count integer NOT NULL DEFAULT 0, reset_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS google_connections (user_id text PRIMARY KEY, encrypted_tokens text NOT NULL, calendars jsonb NOT NULL DEFAULT '[]');
