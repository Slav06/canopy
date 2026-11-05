import { readiness } from "../lib/readiness";
import { pool } from "../lib/store";
const report = await readiness();
console.log(JSON.stringify(report, null, 2));
await pool().end();
process.exitCode = report.readyForTeam ? 0 : 2;
