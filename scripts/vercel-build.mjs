import { spawn } from "node:child_process";

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      env: process.env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Vercel build step failed (${code ?? "signal"})`)),
    );
  });
}

if (process.env.VERCEL_ENV === "production") {
  if (process.env.WORKSPACE_MODE !== "live")
    throw new Error("Production Vercel deploy requires WORKSPACE_MODE=live");
  if (!process.env.DATABASE_URL)
    throw new Error("Production Vercel deploy requires DATABASE_URL");
  if ((process.env.SESSION_SECRET?.length ?? 0) < 32)
    throw new Error("Production Vercel deploy requires a 32+ character SESSION_SECRET");
  if (!process.env.APP_ORIGIN?.startsWith("https://"))
    throw new Error("Production Vercel deploy requires an HTTPS APP_ORIGIN");

  // Vercel functions have no startup hook; migrate and safely create the first
  // Admin during the production build. These scripts preserve existing users.
  await run(["--import", "tsx", "db/migrate.ts"]);
  await run(["--import", "tsx", "db/bootstrap-admin.ts"]);
}

await run(["node_modules/next/dist/bin/next", "build", "--webpack"]);
