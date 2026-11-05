import { can, canReadLead, type Capability } from "./permissions";
import { cookies } from "next/headers";
import {
  createHmac,
  timingSafeEqual,
  scryptSync,
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
export function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
}
export function verifyPassword(password: string, hash: string) {
  const [salt, digest] = hash.split(":");
  if (!salt || !digest) return false;
  const a = Buffer.from(digest, "hex"),
    b = scryptSync(password, salt, 64);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function signSession(id: string) {
  const payload = Buffer.from(
    JSON.stringify({ id, exp: Date.now() + 8 * 3600000 }),
  ).toString("base64url");
  return (
    payload +
    "." +
    createHmac("sha256", secret()).update(payload).digest("base64url")
  );
}
export function parseSession(token: string) {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", secret()).update(payload).digest();
  const actual = Buffer.from(sig, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return null;
  try {
    const p = JSON.parse(Buffer.from(payload, "base64url").toString());
    return p.exp > Date.now() ? p.id : null;
  } catch {
    return null;
  }
}
export async function currentUser(): Promise<User> {
  const c = await cookies();
  const s = await readState();
  const id = demo
    ? ["caller", "manager"].includes(c.get("canopy_demo_role")?.value ?? "")
      ? c.get("canopy_demo_role")!.value
      : "owner"
    : parseSession(c.get("canopy_session")?.value ?? "");
  const u = s.users.find((u) => u.id === id);
  if (!u || u.disabled) throw new HttpError(401, "Sign in to continue");
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
