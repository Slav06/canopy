import { dataDirectory } from "./data-directory";
import { publicReviews } from "./post-call";
import { can, canReadLead } from "./permissions";
import { Pool } from "pg";
import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { State } from "./model";
import { seed } from "./seed";
export const demo =
  process.env.WORKSPACE_MODE === "demo" ||
  (!process.env.WORKSPACE_MODE && process.env.NODE_ENV !== "production");
const file = path.join(dataDirectory(), "demo.json");
const globalDb = globalThis as typeof globalThis & {
  canopyPool?: Pool;
  canopyQueue?: Promise<unknown>;
};
export function pool() {
  return (globalDb.canopyPool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
  }));
}
async function readDemo() {
  try {
    const s = JSON.parse(await readFile(file, "utf8")) as State;
    if (!s.users.some((u) => u.id === "manager"))
      s.users.push({
        id: "manager",
        name: "Management Demo",
        email: "manager@canopy.demo",
        role: "manager",
        capabilities: {},
      });
    return s;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    return seed();
  }
}
export async function readState(): Promise<State> {
  if (demo) return readDemo();
  const r = await pool().query("SELECT data FROM workspace WHERE id=1");
  if (!r.rows[0]) throw Error("Database not migrated");
  return r.rows[0].data;
}
export async function mutate<T>(fn: (s: State) => T | Promise<T>): Promise<T> {
  let release!: () => void;
  const previous = globalDb.canopyQueue ?? Promise.resolve();
  globalDb.canopyQueue = new Promise<void>((r) => (release = r));
  await previous;
  try {
    if (demo) {
      const s = await readDemo();
      const result = await fn(s);
      s.revision++;
      await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
      const temp = file + ".tmp";
      await writeFile(temp, JSON.stringify(s), { mode: 0o600 });
      await rename(temp, file);
      return result;
    }
    const client = await pool().connect();
    try {
      await client.query("BEGIN");
      const r = await client.query(
        "SELECT data FROM workspace WHERE id=1 FOR UPDATE",
      );
      const s = r.rows[0].data as State;
      const result = await fn(s);
      s.revision++;
      await client.query("UPDATE workspace SET data=$1 WHERE id=1", [
        JSON.stringify(s),
      ]);
      await client.query("COMMIT");
      return result;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } finally {
    release();
  }
}
export function publicState(
  s: State,
  user: Pick<import("./model").User, "id" | "role" | "capabilities">,
) {
  const owner = user.role === "owner";
  const leads = s.leads.filter((l) => canReadLead(user, l));
  const financial = can(user, "manageDeals") || can(user, "viewReports");
  const archive = s.leads.filter(
    (l) =>
      !!l.deletedAt &&
      (owner || (financial && s.deals.some((d) => d.leadId === l.id))),
  );
  const related = financial
    ? s.leads.filter((l) => s.deals.some((d) => d.leadId === l.id))
    : [];
  const ids = new Set(leads.map((l) => l.id));
  const contactIds = new Set(
    [...leads, ...archive, ...related].map((l) => l.contactId),
  );
  const propertyIds = new Set(
    [...leads, ...archive, ...related].map((l) => l.propertyId),
  );
  return {
    ...s,
    callReviews: publicReviews(s, user as import("./model").User),
    archivedLeads: [
      ...archive,
      ...related.filter(
        (l) =>
          !leads.some((x) => x.id === l.id) &&
          !archive.some((x) => x.id === l.id),
      ),
    ],
    messages: (s.messages ?? []).filter((m) => owner || ids.has(m.leadId)),
    users: s.users.map(({ passwordHash, dialerrEmail, ...u }) => u),
    contacts: s.contacts.filter((c) => owner || contactIds.has(c.id)),
    properties: s.properties
      .filter((p) => owner || propertyIds.has(p.id))
      .map((p) => ({
        ...p,
        ownerIds: p.ownerIds.filter((id) => owner || contactIds.has(id)),
      })),
    leads,
    activities: s.activities.filter((a) => owner || ids.has(a.leadId)),
    appointments: s.appointments.filter((a) => owner || ids.has(a.leadId)),
    deals: financial ? s.deals : [],
    buyers: can(user, "manageBuyers") ? s.buyers : [],
    documents: can(user, "manageDeals") ? s.documents : [],
    audit: owner ? s.audit : [],
    events: [],
    providerMappings: [],
  };
}
