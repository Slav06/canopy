import { passwordHash } from "../lib/auth";
import { mutate, pool } from "../lib/store";
if (process.env.WORKSPACE_MODE !== "live")
  throw Error("Set WORKSPACE_MODE=live");
const email = process.env.NEW_USER_EMAIL;
const password = process.env.NEW_USER_PASSWORD;
const name = process.env.NEW_USER_NAME;
const rawRole = process.env.NEW_USER_ROLE ?? "owner";
if (!["owner", "admin", "caller", "basic", "manager"].includes(rawRole))
  throw Error("Use admin, basic, or manager for NEW_USER_ROLE");
const role =
  rawRole === "manager"
    ? "manager"
    : ["caller", "basic"].includes(rawRole)
      ? "caller"
      : "owner";
if (!email || !password || password.length < 14 || !name)
  throw Error(
    "Set NEW_USER_EMAIL, NEW_USER_NAME and NEW_USER_PASSWORD (14+ characters) securely in this process environment",
  );
await mutate((s) => {
  if (s.users.some((u) => u.email === email))
    throw Error("User already exists");
  s.users.push({
    id: crypto.randomUUID(),
    name,
    email,
    role,
    capabilities: {},
    passwordHash: passwordHash(password),
    dialerrEmail: process.env.NEW_USER_DIALERR_EMAIL,
  });
});
console.log("User created");
await pool().end();
