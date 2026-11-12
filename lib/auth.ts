import { can, canReadLead, type Capability } from "./permissions";
import { cookies } from "next/headers";
import {
  createHash,
  createHmac,
  timingSafeEqual,
  randomBytes,
} from "node:crypto";
import { demo, readState } from "./store";
import { User } from "./model";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32)
    throw new HttpError(
      503,
      "Set SESSION_SECRET to at least 32 random characters",
    );
  return value;
}
/** A new private-link key. Only its hash is stored, so a lost link is replaced, never recovered. */
export function newAccessKey() {
  const key = randomBytes(32).toString("base64url");
  return { key, hash: accessHash(key) };
}
export function accessHash(key: string) {
  return createHash("sha256").update(key).digest("hex");
}
/** Sessions are bound to the current link, so replacing a link signs its old sessions out. */
const linkStamp = (hash: string) => hash.slice(0, 16);
export const sessionSeconds = 30 * 24 * 3600;
export function signSession(user: Pick<User, "id" | "accessHash">) {
  const payload = Buffer.from(
    JSON.stringify({
      id: user.id,
      link: linkStamp(user.accessHash ?? ""),
      exp: Date.now() + sessionSeconds * 1000,
    }),
  ).toString("base64url");
  return (
    payload +
    "." +
    createHmac("sha256", secret()).update(payload).digest("base64url")
  );
}
export function parseSession(
  token: string,
): { id: string; link: string } | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", secret()).update(payload).digest();
  const actual = Buffer.from(sig, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return null;
  try {
    const p = JSON.parse(Buffer.from(payload, "base64url").toString());
    return p.exp > Date.now() && typeof p.id === "string"
      ? { id: p.id as string, link: String(p.link ?? "") }
      : null;
  } catch {
    return null;
  }
}
export async function currentUser(): Promise<User> {
  const c = await cookies();
  const s = await readState();
  if (demo) {
    const role = c.get("canopy_demo_role")?.value ?? "";
    const id = ["caller", "manager"].includes(role) ? role : "owner";
    const u = s.users.find((u) => u.id === id);
    if (!u || u.disabled) throw new HttpError(401, "Sign in to continue");
    return u;
  }
  const session = parseSession(c.get("canopy_session")?.value ?? "");
  const u = s.users.find((u) => u.id === session?.id);
  if (
    !session ||
    !u ||
    u.disabled ||
    !u.accessHash ||
    linkStamp(u.accessHash) !== session.link
  )
    throw new HttpError(401, "Sign in to continue");
  return u;
}
export function ownerOnly(user: User) {
  if (user.role !== "owner")
    throw new HttpError(403, "Only an admin can do this");
}
export function assertLead(
  user: User,
  lead: { assignedTo: string; deletedAt?: string } | undefined,
) {
  if (!lead || lead.deletedAt) throw new HttpError(404, "Lead not found");
  if (!canReadLead(user, lead))
    throw new HttpError(403, "This lead is not assigned to you");
}
export function checkOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const expected = process.env.APP_ORIGIN ?? "http://127.0.0.1:3210";
  if (origin !== expected)
    throw new HttpError(403, "Request origin not allowed");
}

export function requireCapability(user: User, key: Capability) {
  if (!can(user, key))
    throw new HttpError(403, "Your admin has not enabled this capability");
}
