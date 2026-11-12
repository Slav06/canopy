import { demo, pool, readState } from "./store";
export async function readiness() {
  const checks: {
    name: string;
    ok: boolean;
    detail: string;
    required: boolean;
  }[] = [];
  const add = (name: string, ok: boolean, detail: string, required = true) =>
    checks.push({ name, ok, detail, required });
  add(
    "Live workspace",
    !demo,
    demo
      ? "Demo is active. Do not enter real seller data."
      : "Live mode configured",
  );
  add(
    "Session security",
    (process.env.SESSION_SECRET?.length ?? 0) >= 32,
    "Set a random SESSION_SECRET of 32+ characters",
  );
  add(
    "Database configuration",
    !!process.env.DATABASE_URL,
    "Set DATABASE_URL in the server environment",
  );
  if (!demo) {
    try {
      await pool().query("SELECT 1");
      const s = await readState();
      add(
        "Database and migration",
        true,
        "PostgreSQL is reachable and workspace exists",
      );
      add(
        "Owner account",
        s.users.some((u) => u.role === "owner" && !!u.accessHash),
        "Open the site once to claim the Admin link",
      );
    } catch {
      add(
        "Database and migration",
        false,
        "Database unavailable or migration not applied",
      );
    }
  }
  add(
    "Private HTTPS address",
    /^https:\/\//.test(process.env.APP_ORIGIN ?? ""),
    "Remote callers require an approved private host and HTTPS",
  );
  add(
    "Dialerr embedded toolbar",
    true,
    "Official toolbar with in-panel sign-in; no Dialerr API credentials used",
    false,
  );
  add(
    "Dialerr role boundary",
    process.env.DIALERR_ROLE_BOUNDARY_VERIFIED === "true",
    "Verify permissions inside the Dialerr account before team calling",
    false,
  );
  add(
    "Google OAuth",
    !!process.env.GOOGLE_CLIENT_ID &&
      !!process.env.GOOGLE_CLIENT_SECRET &&
      Buffer.from(process.env.TOKEN_ENCRYPTION_KEY ?? "", "base64").length ===
        32,
    "Configure OAuth client and token encryption",
    false,
  );
  return {
    readyForTeam: checks.filter((c) => c.required).every((c) => c.ok),
    mode: demo ? "demo" : "live",
    checks,
  };
}
