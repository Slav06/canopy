import { createHmac, timingSafeEqual, createHash } from "node:crypto";
import { State, User } from "./model";
import { HttpError, assertLead } from "./auth";
export function verifyWebhook(raw: string, signature: string, secret: string) {
  const expected = createHmac("sha256", secret).update(raw).digest();
  const supplied = Buffer.from(signature.replace(/^sha256=/, ""), "hex");
  return (
    expected.length === supplied.length && timingSafeEqual(expected, supplied)
  );
}
export function eventKey(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}
export function callingEligibility(
  s: State,
  user: User,
  leadId: string,
  now = new Date(),
) {
  const lead = s.leads.find((l) => l.id === leadId);
  assertLead(user, lead);
  const c = s.contacts.find((c) => c.id === lead!.contactId)!;
  const p = s.properties.find((p) => p.id === lead!.propertyId)!;
  if (c.dnc) throw new HttpError(403, "Do Not Contact: calling is blocked");
  const phone =
    c.phones.find((p) => p.state === "preferred") ??
    c.phones.find((p) => p.state === "valid");
  if (!phone) throw new HttpError(403, "No callable phone number");
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: p.timezone,
      hour: "numeric",
      hourCycle: "h23",
    }).format(now),
  );
  if (hour < s.settings.callStart || hour >= s.settings.callEnd)
    throw new HttpError(
      403,
      "Outside the configured calling window in the property timezone",
    );
  return { lead: lead!, contact: c, property: p, phone };
}
