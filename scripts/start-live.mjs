import { spawn } from "node:child_process";
const env = { ...process.env };
if (env.WORKSPACE_MODE !== "live")
  throw new Error("Hosted startup requires WORKSPACE_MODE=live");
env.APP_ORIGIN ||= env.RENDER_EXTERNAL_URL;
if (!env.APP_ORIGIN || !/^https:\/\//.test(env.APP_ORIGIN))
  throw new Error("Set APP_ORIGIN to the exact HTTPS CRM address");
if (!env.DATABASE_URL || (env.SESSION_SECRET?.length || 0) < 32)
  throw new Error("Database and session security must be configured");
function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error("Startup step failed")),
    );
  });
}
await run(["--import", "tsx", "db/migrate.ts"]);
await run(["--import", "tsx", "db/bootstrap-admin.ts"]);
delete env.BOOTSTRAP_ADMIN_PASSWORD;
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "0.0.0.0",
    "--port",
    env.PORT || "10000",
  ],
  { env, stdio: "inherit" },
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => server.kill(signal));
server.on("error", () => process.exit(1));
server.on("exit", (code) => process.exit(code ?? 1));
