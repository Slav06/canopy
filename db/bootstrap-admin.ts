import { passwordHash } from "../lib/auth";
import { mutate, pool } from "../lib/store";
import { randomUUID } from "node:crypto";
try {
  if (process.env.WORKSPACE_MODE !== "live")
    throw Error("Bootstrap requires live mode");
  await mutate((s) => {
    if (
      s.users.some((u) => u.role === "owner" && u.passwordHash && !u.disabled)
    )
      return;
    if (s.users.length)
      throw Error(
        "Existing users found without an active admin. Use the recovery procedure; bootstrap will not change accounts.",
      );
    const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
    if (
      !email ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !password ||
      password.length < 14
    )
      throw Error(
        "First launch needs BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD (14+ characters) in the hosting environment.",
      );
    s.users.push({
      id: randomUUID(),
      name: process.env.BOOTSTRAP_ADMIN_NAME || "Canopy Admin",
      email,
      role: "owner",
      capabilities: {},
      passwordHash: passwordHash(password),
    });
  });
  console.log("Admin bootstrap complete; existing accounts were preserved.");
} finally {
  await pool().end();
}
