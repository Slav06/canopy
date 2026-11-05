import { pool } from "../lib/store";
import { seed } from "../lib/seed";
const db = pool();
await db.query(
  `CREATE TABLE IF NOT EXISTS workspace(id integer PRIMARY KEY CHECK(id=1), data jsonb NOT NULL); CREATE TABLE IF NOT EXISTS sessions_rate(key text PRIMARY KEY, count integer NOT NULL DEFAULT 0, reset_at timestamptz NOT NULL); CREATE TABLE IF NOT EXISTS google_connections(user_id text PRIMARY KEY, encrypted_tokens text NOT NULL, calendars jsonb NOT NULL DEFAULT '[]');`,
);
const s = seed();
s.users = [];
s.contacts = [];
s.properties = [];
s.leads = [];
s.activities = [];
s.appointments = [];
s.deals = [];
s.buyers = [];
await db.query(
  "INSERT INTO workspace(id,data) VALUES(1,$1) ON CONFLICT(id) DO NOTHING",
  [JSON.stringify(s)],
);
console.log(
  "Migration complete. Empty live workspace; demo records were not imported.",
);
await db.end();
