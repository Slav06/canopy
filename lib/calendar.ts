import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { pool } from "./store";
import { HttpError } from "./auth";
function key() {
  const k = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY ?? "", "base64");
  if (k.length !== 32)
    throw new HttpError(
      503,
      "Calendar requires a 32-byte base64 TOKEN_ENCRYPTION_KEY",
    );
  return k;
}
export function encrypt(text: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(text), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
}
export function decrypt(text: string) {
  const b = Buffer.from(text, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(), b.subarray(0, 12));
  decipher.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([
    decipher.update(b.subarray(28)),
    decipher.final(),
  ]).toString();
}
export async function googleFetch(
  userId: string,
  endpoint: string,
  options: RequestInit = {},
) {
  const r = await pool().query(
    "SELECT * FROM google_connections WHERE user_id=$1",
    [userId],
  );
  if (!r.rows[0]) throw new HttpError(409, "Connect Google Calendar first");
  let tokens = JSON.parse(decrypt(r.rows[0].encrypted_tokens));
  if (tokens.expires_at < Date.now() + 60000) {
    const refresh = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: tokens.refresh_token,
        grant_type: "refresh_token",
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!refresh.ok)
      throw new HttpError(
        409,
        "Google connection expired. Reconnect Calendar.",
      );
    tokens = { ...tokens, ...(await refresh.json()) };
    tokens.expires_at = Date.now() + tokens.expires_in * 1000;
    await pool().query(
      "UPDATE google_connections SET encrypted_tokens=$1 WHERE user_id=$2",
      [encrypt(JSON.stringify(tokens)), userId],
    );
  }
  const response = await fetch(
    "https://www.googleapis.com/calendar/v3/" + endpoint,
    {
      ...options,
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(15000),
    },
  );
  if (response.status === 204) return {};
  if (!response.ok)
    throw new HttpError(
      [404, 409, 410, 429].includes(response.status) ? response.status : 502,
      "Google Calendar request failed (" +
        response.status +
        "). Retry or reconnect.",
    );
  return response.json();
}
export async function allowedCalendar(userId: string, id: string) {
  const r = await pool().query(
    "SELECT calendars FROM google_connections WHERE user_id=$1",
    [userId],
  );
  if (!r.rows[0]?.calendars.includes(id))
    throw new HttpError(403, "Select a permitted calendar first");
}
