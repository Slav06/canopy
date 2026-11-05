import { State, uid } from "./model";
import { eventKey } from "./dialerr";
export function ingestProviderEvent(s: State, e: any, raw: string) {
  const stable = e.data?.message?.id ?? e.data?.message_id ?? e.data?.call?.id;
  const key = stable
    ? `${e.event}:${stable}:${e.data?.disposition?.id ?? ""}`
    : eventKey(raw);
  if (s.events.includes(key)) return { duplicate: true };
  s.events.push(key);
  const providerId = String(e.data?.lead?.id ?? e.data?.lead_id ?? "");
  const mapping = s.providerMappings.find((m) => m.providerId === providerId);
  const matches = mapping
    ? s.leads.filter((l) => l.contactId === mapping.contactId)
    : [];
  const text = String(e.data?.message?.body ?? e.data?.text ?? "");
  if (
    e.event === "message.received" &&
    /^(stop|unsubscribe|cancel|end|quit)$/i.test(text.trim())
  ) {
    const phone = e.data?.lead?.phone ?? e.data?.from;
    s.contacts
      .filter((c) => c.phones.some((p) => p.number === phone))
      .forEach((c) => {
        c.dnc = true;
        c.phones.forEach((p) => {
          if (p.number === phone) p.state = "opted-out";
        });
      });
  }
  s.activities.push({
    id: uid(),
    leadId: matches.length === 1 ? matches[0].id : "unassociated",
    at: new Date().toISOString(),
    kind: matches.length === 1 ? e.event : "Provider association needs review",
    text:
      (matches.length === 1
        ? e.event === "message.sent"
          ? "Provider accepted outbound message; delivery unverified"
          : "Provider event"
        : "Association needs review") +
      " · " +
      JSON.stringify(e.data).slice(0, 20000),
    userId: "provider",
    providerId: key,
  });
  return { accepted: true, needsReview: matches.length !== 1 };
}
