import { readFile, mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { pool, demo } from "../lib/store";
import { openBackup } from "../lib/backup";
if (demo) throw Error("Restore requires a separate live-mode target database");
const input = process.argv[2];
if (!input) throw Error("Supply encrypted backup path");
const snapshot = openBackup(
  await readFile(input),
  process.env.BACKUP_PASSPHRASE ?? "",
);
if (
  snapshot.format !== 1 ||
  !Array.isArray(snapshot.state?.users) ||
  !Array.isArray(snapshot.state?.documents) ||
  !Array.isArray(snapshot.files) ||
  !Array.isArray(snapshot.connections)
)
  throw Error("Invalid backup");
const client = await pool().connect();
const created: string[] = [];
try {
  await client.query("BEGIN");
  const r = await client.query(
    "SELECT data FROM workspace WHERE id=1 FOR UPDATE",
  );
  if (!r.rows[0]) throw Error("Migrate a NEW target database first");
  const current = r.rows[0].data;
  if (
    [
      "users",
      "contacts",
      "properties",
      "leads",
      "deals",
      "buyers",
      "activities",
      "appointments",
      "documents",
    ].some((k) => current[k]?.length)
  )
    throw Error("Refusing restore: target workspace is not empty");
  const links = await client.query("SELECT count(*) FROM google_connections");
  if (Number(links.rows[0].count))
    throw Error("Refusing restore: calendar connections exist");
  const folder = path.join(process.cwd(), ".data", "documents");
  await mkdir(folder, { recursive: true, mode: 0o700 });
  for (const file of snapshot.files) {
    if (
      !/^[a-f0-9-]+\.bin$/.test(file.key) ||
      !snapshot.state.documents.some(
        (d: { storageKey: string }) => d.storageKey === file.key,
      )
    )
      throw Error("Invalid document manifest");
    const target = path.join(folder, file.key);
    try {
      const existing = await readFile(target);
      if (!existing.equals(Buffer.from(file.data, "base64")))
        throw Error("A different private file already exists");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      await writeFile(target, Buffer.from(file.data, "base64"), {
        mode: 0o600,
        flag: "wx",
      });
      created.push(target);
    }
  }
  if (
    snapshot.state.documents.some(
      (d: { storageKey: string }) =>
        !snapshot.files.some((f: { key: string }) => f.key === d.storageKey),
    )
  )
    throw Error("Backup is missing documents");
  await client.query("UPDATE workspace SET data=$1 WHERE id=1", [
    JSON.stringify(snapshot.state),
  ]);
  for (const c of snapshot.connections)
    await client.query(
      "INSERT INTO google_connections(user_id,encrypted_tokens,calendars) VALUES($1,$2,$3)",
      [c.user_id, c.encrypted_tokens, JSON.stringify(c.calendars)],
    );
  await client.query("COMMIT");
  console.log(
    "Full restore completed into empty database. Verify records before using this target.",
  );
} catch (e) {
  await client.query("ROLLBACK");
  for (const file of created) await unlink(file);
  throw e;
} finally {
  client.release();
  await pool().end();
}
