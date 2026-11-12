import { newAccessKey } from "../lib/auth";
import { mutate, pool } from "../lib/store";
if (process.env.WORKSPACE_MODE !== "live")
  throw Error("Set WORKSPACE_MODE=live");
const name = process.env.NEW_USER_NAME?.trim();
const rawRole = process.env.NEW_USER_ROLE ?? "owner";
if (!["owner", "admin", "caller", "basic", "manager"].includes(rawRole))
  throw Error("Use admin, basic, or manager for NEW_USER_ROLE");
const role =
  rawRole === "manager"
    ? "manager"
    : ["caller", "basic"].includes(rawRole)
      ? "caller"
      : "owner";
if (!name) throw Error("Set NEW_USER_NAME");
const { key, hash } = newAccessKey();
await mutate((s) => {
  if (s.users.some((u) => u.name.toLowerCase() === name.toLowerCase()))
    throw Error("User already exists");
  s.users.push({
    id: crypto.randomUUID(),
    name,
    email: "",
    role,
    capabilities: {},
    accessHash: hash,
    dialerrEmail: process.env.NEW_USER_DIALERR_EMAIL,
  });
});
// The link is shown once; only its hash is stored. This is also the recovery
// path if every Admin link is lost.
console.log(
  "User created. Private link (share it privately, shown once):\n" +
    (process.env.APP_ORIGIN ?? "http://127.0.0.1:3210") +
    "/?key=" +
    key,
);
await pool().end();
