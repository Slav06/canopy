import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pool, demo } from "../lib/store";
import { sealBackup } from "../lib/backup";
if (demo) throw Error("Full backups require WORKSPACE_MODE=live");
const output = process.argv[2];
if (!output) throw Error("Supply a NEW output file path");
const client = await pool().connect();
try {
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
  const r = await client.query("SELECT data FROM workspace WHERE id=1");
  if (!r.rows[0]) throw Error("Migrate the database first");
  const state = r.rows[0].data;
  const connections = await client.query("SELECT * FROM google_connections");
  const files = [];
  for (const doc of state.documents) {
    if (!/^[a-f0-9-]+\.bin$/.test(doc.storageKey))
      throw Error("Unsafe storage key");
    files.push({
      key: doc.storageKey,
      data: (
        await readFile(
          path.join(process.cwd(), ".data", "documents", doc.storageKey),
        )
      ).toString("base64"),
    });
  }
  const snapshot = {
    format: 1,
    createdAt: new Date().toISOString(),
    state,
    connections: connections.rows,
    files,
  };
  await writeFile(
    output,
    sealBackup(snapshot, process.env.BACKUP_PASSPHRASE ?? ""),
    { mode: 0o600, flag: "wx" },
  );
  await client.query("COMMIT");
  console.log(
    "Encrypted full backup created. Store its passphrase and token encryption key separately.",
  );
} catch (e) {
  await client.query("ROLLBACK");
  throw e;
} finally {
  client.release();
  await pool().end();
}
