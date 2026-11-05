import type { User, Lead } from "./model";
export const capabilityLabels = {
  viewAllLeads: "View all team leads",
  editLeads: "Edit existing lead, contact and property information",
  assignLeads: "Assign leads to agents",
  createLeads: "Create new leads",
  importLeads: "Import CSV lists",
  manageDeals: "View and manage deals and financials",
  manageBuyers: "View and manage buyers",
  viewReports: "View reports",
  exportData: "Export CRM records",
  manageAppointments: "Book and update appointments",
  editScripts: "Publish script templates",
} as const;
export type Capability = keyof typeof capabilityLabels;
export const roleLabel = (u: Pick<User, "role">) =>
  u.role === "owner"
    ? "Admin"
    : u.role === "manager"
      ? "Upper Management"
      : "Basic Agent";
export function can(
  u: Pick<User, "role" | "capabilities">,
  permission: Capability,
) {
  return (
    u.role === "owner" ||
    (u.role === "manager" && u.capabilities?.[permission] === true)
  );
}
export function canReadLead(
  u: Pick<User, "id" | "role" | "capabilities">,
  l: Pick<Lead, "assignedTo" | "deletedAt">,
) {
  return !l.deletedAt && (can(u, "viewAllLeads") || l.assignedTo === u.id);
}
export function additivePatch(lead: Lead, body: Record<string, unknown>) {
  for (const [key, value] of Object.entries(body)) {
    if (key === "answers") {
      if (!value || typeof value !== "object" || Array.isArray(value))
        return false;
      for (const [k, v] of Object.entries(value)) {
        if (typeof v !== "string" || (lead.answers[k] && v !== lead.answers[k]))
          return false;
      }
    } else if (key === "notes") {
      if (value !== lead.notes) return false;
    } else if (key === "motivation") {
      if (
        typeof value !== "string" ||
        (lead.motivation && value !== lead.motivation)
      )
        return false;
    } else return false;
  }
  return true;
}

export function canBookAppointment(
  u: Pick<User, "role" | "capabilities">,
  bookingAllowed: boolean,
) {
  return (
    can(u, "manageAppointments") || (u.role === "caller" && bookingAllowed)
  );
}
