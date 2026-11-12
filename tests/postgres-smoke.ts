/** Real PostgreSQL + production HTTP server, isolated temporary state, no providers. */
import EmbeddedPostgres from "embedded-postgres";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import net from "node:net";
import assert from "node:assert/strict";
import { Pool } from "pg";
const exec = promisify(execFile);
const port = async () => {
  const server = net.createServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const p = (server.address() as net.AddressInfo).port;
  await new Promise<void>((r) => server.close(() => r()));
  return p;
};
const dir = await mkdtemp("/tmp/canopy-pg-test-");
const dbPort = await port(),
  appPort = await port();
const password = randomBytes(24).toString("hex");
const origin = `http://127.0.0.1:${appPort}`;
const env = {
  ...process.env,
  WORKSPACE_MODE: "live",
  CRM_DATA_DIR: dir + "/private",
  DATABASE_URL: `postgresql://test:${password}@127.0.0.1:${dbPort}/canopy_test`,
  APP_ORIGIN: origin,
  SESSION_SECRET: randomBytes(32).toString("hex"),
  DIALERR_SECRET: "",
  DIALERR_API_TOKEN: "",
  LIVE_CALLING_ENABLED: "false",
  LIVE_MESSAGING_ENABLED: "false",
  GOOGLE_CLIENT_ID: "",
};
const pg = new EmbeddedPostgres({
  databaseDir: dir + "/pg",
  user: "test",
  password,
  port: dbPort,
  persistent: true,
  authMethod: "scram-sha-256",
  autoRehydrateSymlinks: true,
  postgresFlags: ["-h", "127.0.0.1", "-k", dir],
  onLog: () => {},
  onError: () => {},
});
let app: ReturnType<typeof spawn> | undefined;
let database: Pool | undefined;
let started = false;
const results: string[] = [];
const testFiles: string[] = [];
const pass = (name: string, condition: unknown) => {
  assert.ok(condition, name);
  results.push(name);
};
let cookie = "";
async function request(
  route: string,
  method = "GET",
  body?: unknown,
  session = cookie,
) {
  const r = await fetch(origin + "/api/" + route, {
    method,
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      Cookie: session,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  return {
    status: r.status,
    data: await r.json(),
    cookie: r.headers.get("set-cookie")?.split(";")[0] ?? "",
  };
}
try {
  await pg.initialise();
  await pg.start();
  started = true;
  await pg.createDatabase("canopy_test");
  await exec(process.execPath, ["--import", "tsx", "db/migrate.ts"], { env });
  app = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(appPort),
    ],
    { env, stdio: "ignore" },
  );
  let ready = false;
  for (let i = 0; i < 80; i++) {
    try {
      await fetch(origin, { signal: AbortSignal.timeout(500) });
      ready = true;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  assert.ok(ready, "isolated production server started");
  const health = await request("health");
  pass(
    "new workspace is healthy and awaiting its admin",
    health.status === 200 &&
      JSON.stringify(health.data) === '{"status":"setup"}' &&
      (await request("auth/setup")).data.claimable === true,
  );
  pass(
    "live workspace refuses anonymous access",
    (await request("state")).status === 401,
  );
  pass(
    "unknown link refused",
    (await request("auth/link", "POST", { key: "wrong" })).status === 401,
  );
  const login = await request("auth/claim", "POST", { name: "Test Owner" });
  pass(
    "first visitor claims the admin link with an HttpOnly session",
    login.status === 200 && !!login.cookie && login.data.key.length >= 40,
  );
  pass(
    "admin can only be claimed once",
    (await request("auth/claim", "POST", { name: "Intruder" }, "")).status ===
      409 && (await request("auth/setup")).data.claimable === false,
  );
  pass(
    "health reports ok without exposing workspace data",
    JSON.stringify((await request("health")).data) === '{"status":"ok"}',
  );
  const ownerLink = await request(
    "auth/link",
    "POST",
    { key: login.data.key },
    "",
  );
  pass(
    "admin private link signs in again",
    ownerLink.status === 200 && !!ownerLink.cookie,
  );
  cookie = login.cookie;
  const ownerCookie = cookie;
  const initial = await request("state");
  pass(
    "migration creates empty live workspace without demo sellers",
    initial.data.mode === "live" &&
      initial.data.state.leads.length === 0 &&
      initial.data.state.contacts.length === 0,
  );
  pass(
    "workspace holds only the claimed admin and no link secrets",
    initial.data.state.users.length === 1 &&
      initial.data.state.users[0].name === "Test Owner" &&
      !JSON.stringify(initial.data).includes("accessHash"),
  );
  const caller = await request("team/users", "POST", {
    name: "Test Caller",
  });
  pass(
    "owner creates caller with a private link",
    caller.status === 200 &&
      caller.data.role === "caller" &&
      caller.data.key.length >= 40,
  );
  const first = await request("leads", "POST", {
    name: "Real-test Seller",
    email: "seller@test.invalid",
    phone: "+12025550111",
    address: "1 Fixture Street",
    city: "Dallas",
    state: "TX",
    zip: "75208",
    timezone: "America/Chicago",
  });
  pass("live lead persists", first.status === 200);
  const id = first.data.id;
  const second = await request("leads", "POST", {
    name: "Same seller",
    phone: "+12025550111",
    address: "2 Fixture Street",
    city: "Dallas",
    state: "TX",
    zip: "75208",
    timezone: "America/Chicago",
  });
  pass(
    "same seller retains separate properties",
    second.status === 200 &&
      second.data.contactId === first.data.contactId &&
      second.data.propertyId !== first.data.propertyId,
  );
  await request("leads/" + id, "PATCH", { assignedTo: caller.data.id });
  const callerLogin = await request(
    "auth/link",
    "POST",
    { key: caller.data.key },
    "",
  );
  pass("caller private link signs in", callerLogin.status === 200);
  cookie = callerLogin.cookie;
  const state = await request("state");
  pass(
    "live caller sees assigned lead only",
    state.data.state.leads.length === 1 &&
      state.data.state.leads[0].id === id &&
      state.data.state.deals.length === 0,
  );
  pass("live caller cannot export", (await request("export")).status === 403);
  pass(
    "live caller cannot edit owner property lead",
    (await request("leads/" + second.data.id, "PATCH", { notes: "denied" }))
      .status === 403,
  );
  pass(
    "live caller cannot create team accounts",
    (await request("team/users", "POST", { name: "denied" })).status === 403,
  );
  await Promise.all([
    request("leads/" + id + "/notes", "POST", {
      text: "Persistent property note",
    }),
    request("leads/" + id, "PATCH", { motivation: "Timeline confirmed" }),
  ]);
  const stored = await request("state");
  pass(
    "concurrent independent updates both persist in PostgreSQL",
    stored.data.state.leads[0].notes === "Persistent property note" &&
      stored.data.state.leads[0].motivation === "Timeline confirmed",
  );
  cookie = ownerCookie;
  const ap = {
    id: "fixture-event",
    leadId: id,
    assignedTo: caller.data.id,
    title: "Fixture appointment",
    start: "2026-11-10T15:00:00Z",
    end: "2026-11-10T16:00:00Z",
    timezone: "America/Chicago",
  };
  await request("appointments", "POST", ap);
  await request("appointments", "POST", ap);
  pass(
    "live appointment retries are idempotent",
    (await request("state")).data.state.appointments.length === 1,
  );
  cookie = callerLogin.cookie;
  await request("contacts/" + first.data.contactId, "PATCH", { dnc: true });
  pass(
    "live opt-out blocks calling",
    (await request("dialerr/prepare", "POST", { leadId: id })).status === 403,
  );
  pass(
    "toolbar-only mode disables CRM message API",
    (
      await request("messages", "POST", {
        id: "fixture-msg",
        leadId: id,
        body: "Not sent",
      })
    ).status === 410,
  );
  pass(
    "live caller cannot reverse suppression",
    (await request("contacts/" + first.data.contactId, "PATCH", { dnc: false }))
      .status === 403,
  );
  cookie = ownerCookie;
  const exported = await request("export");
  pass(
    "owner export excludes link hashes",
    exported.status === 200 &&
      !JSON.stringify(exported.data).includes("accessHash"),
  );
  await request("team/users/" + caller.data.id, "PATCH", { disabled: true });
  pass(
    "revocation blocks an already-issued caller session",
    (await request("state", "GET", undefined, callerLogin.cookie)).status ===
      401,
  );
  pass(
    "revoked caller link is refused",
    (await request("auth/link", "POST", { key: caller.data.key }, ""))
      .status === 401,
  );
  await request("team/users/" + caller.data.id, "PATCH", { disabled: false });
  const relinked = await request(
    "team/users/" + caller.data.id + "/link",
    "POST",
    {},
  );
  pass(
    "admin replaces a caller link; old link and its sessions stop working",
    relinked.status === 200 &&
      relinked.data.key !== caller.data.key &&
      (await request("auth/link", "POST", { key: caller.data.key }, ""))
        .status === 401 &&
      (await request("state", "GET", undefined, callerLogin.cookie)).status ===
        401,
  );
  callerLogin.cookie = (
    await request("auth/link", "POST", { key: relinked.data.key }, "")
  ).cookie;
  pass(
    "caller cannot replace another person's link",
    (
      await request(
        "team/users/" + caller.data.id + "/link",
        "POST",
        {},
        callerLogin.cookie,
      )
    ).status === 403,
  );
  const deal = await request("deals", "POST", { leadId: id });
  const payload = new FormData();
  payload.set("dealId", deal.data.id);
  payload.set(
    "file",
    new Blob(["%PDF-1.4\nCanopy fixture only"], { type: "application/pdf" }),
    "fixture.pdf",
  );
  const upload = await fetch(origin + "/api/documents", {
    method: "POST",
    headers: { Origin: origin, Cookie: ownerCookie },
    body: payload,
  });
  const doc = await upload.json();
  pass("owner private upload persists", upload.status === 200);
  testFiles.push(dir + "/private/documents/" + doc.storageKey);
  const download = await fetch(origin + "/api/documents/" + doc.id, {
    headers: { Cookie: ownerCookie },
  });
  pass(
    "owner can retrieve private document",
    download.status === 200 && (await download.text()).startsWith("%PDF-1.4"),
  );
  pass(
    "caller cannot retrieve private deal file",
    (await request("documents/" + doc.id, "GET", undefined, callerLogin.cookie))
      .status === 403,
  );
  pass(
    "basic agent cannot delete live CRM lead",
    (await request("leads/" + id, "DELETE", {}, callerLogin.cookie)).status ===
      403,
  );
  const manager = await request("team/users", "POST", {
    name: "Test Manager",
    role: "manager",
  });
  pass(
    "admin creates upper management account",
    manager.status === 200 && manager.data.role === "manager",
  );
  const managementLogin = await request(
    "auth/link",
    "POST",
    { key: manager.data.key },
    "",
  );
  pass("upper management login authenticates", managementLogin.status === 200);
  pass(
    "management with no toggles cannot export",
    (await request("export", "GET", undefined, managementLogin.cookie))
      .status === 403,
  );
  await request("team/users/" + manager.data.id, "PATCH", {
    capabilities: { viewAllLeads: true, editLeads: true, exportData: true },
  });
  pass(
    "management export toggle enforced from database",
    (await request("export", "GET", undefined, managementLogin.cookie))
      .status === 200,
  );
  pass(
    "management cannot delete even with edit permissions",
    (await request("leads/" + id, "DELETE", {}, managementLogin.cookie))
      .status === 403,
  );
  await request("team/users/" + manager.data.id, "PATCH", {
    capabilities: { exportData: false },
  });
  pass(
    "management revocation applies to existing login",
    (await request("export", "GET", undefined, managementLogin.cookie))
      .status === 403,
  );
  pass(
    "admin live deletion is recoverable",
    (await request("leads/" + second.data.id, "DELETE", {})).status === 200,
  );
  pass(
    "admin live restoration works",
    (await request("leads/" + second.data.id + "/restore", "POST", {}))
      .status === 200,
  );
  // Encrypted application backup restores accounts, data and private document manifest.
  const backupEnv = {
    ...env,
    BACKUP_PASSPHRASE: randomBytes(32).toString("hex"),
  };
  await exec(
    process.execPath,
    ["--import", "tsx", "db/backup.ts", dir + "/snapshot.enc"],
    { env: backupEnv },
  );
  await rm(testFiles[0]);
  await pg.createDatabase("canopy_restore");
  const restoreEnv = {
    ...backupEnv,
    DATABASE_URL: `postgresql://test:${password}@127.0.0.1:${dbPort}/canopy_restore`,
  };
  await exec(process.execPath, ["--import", "tsx", "db/migrate.ts"], {
    env: restoreEnv,
  });
  await exec(
    process.execPath,
    ["--import", "tsx", "db/restore.ts", dir + "/snapshot.enc"],
    { env: restoreEnv },
  );
  let refused = false;
  try {
    await exec(
      process.execPath,
      ["--import", "tsx", "db/restore.ts", dir + "/snapshot.enc"],
      { env: restoreEnv },
    );
  } catch {
    refused = true;
  }
  pass("restore refuses a nonempty database", refused);
  database = new Pool({
    connectionString: `postgresql://test:${password}@127.0.0.1:${dbPort}/canopy_restore`,
  });
  const restored = await database.query(
    "SELECT data FROM workspace WHERE id=1",
  );
  const restoredState = restored.rows[0].data;
  pass(
    "full backup and restore preserves property notes and users",
    restoredState.leads.find((l: { id: string }) => l.id === id).notes ===
      "Persistent property note" && restoredState.users.length === 3,
  );
  pass(
    "backup restores missing private file bytes",
    (await readFile(testFiles[0], "utf8")).startsWith("%PDF-1.4"),
  );
  const report = {
    passed: results.length,
    checks: results,
    scope:
      "Isolated real PostgreSQL and production HTTP server. No provider services contacted.",
  };
  await writeFile(
    "docs/postgres-test-results.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (app && app.exitCode === null && app.signalCode === null) {
    const stopped = new Promise((r) => app!.once("exit", r));
    app.kill("SIGTERM");
    await Promise.race([stopped, new Promise((r) => setTimeout(r, 3000))]);
  }
  for (const file of testFiles) await rm(file, { force: true });
  if (database) await database.end();
  if (started) await pg.stop();
  await rm(dir, { recursive: true, force: true });
}
