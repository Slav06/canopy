import type { State, User, CallReview } from "./model";
import { can } from "./permissions";
export const postCallOutcomes = [
  "Seller conversation",
  "No answer",
  "Voicemail",
  "Wrong number",
  "Not interested",
  "Do Not Contact",
] as const;
export const conditions = [
  "TOTAL REHAB",
  "BIG RENOVATION",
  "LITE RENOVATION",
  "NEW TOTALLY RENOVATED",
  "Seller did not provide",
] as const;
export const timelines = [
  "ASAP",
  "3-6 MONTHS",
  "6+ MONTHS",
  "Seller did not provide",
] as const;
export function pendingReview(s: State, user: User) {
  return (s.callReviews ?? []).find(
    (r) => r.userId === user.id && r.phase !== "submitted",
  );
}
export function requiresReview(user: User) {
  return !can(user, "editLeads");
}
export function validatePostCall(a: Record<string, string>) {
  const errors: Record<string, string> = {};
  const require = (key: string, label: string) => {
    if (!a[key]?.trim()) errors[key] = label + " is required";
  };
  if (
    !postCallOutcomes.includes(a.outcome as (typeof postCallOutcomes)[number])
  )
    errors.outcome = "Choose a call outcome";
  require("summary", "Call summary");
  if (a.outcome === "Seller conversation") {
    for (const [key, label] of Object.entries({
      sellerName: "Seller full name",
      sellerPhone: "Seller phone number",
      sellerAddress: "Seller full address",
      condition: "Overall condition",
      conditionDetails: "Details on condition",
      motivation: "Motivation",
      askingPrice: "Seller asking price",
      timeline: "Timeline",
      appointmentSet: "Appointment set",
    }))
      require(key, label);
    if (
      a.condition &&
      !conditions.includes(a.condition as (typeof conditions)[number])
    )
      errors.condition = "Choose a listed condition";
    if (
      a.timeline &&
      !timelines.includes(a.timeline as (typeof timelines)[number])
    )
      errors.timeline = "Choose a listed timeline";
    if (
      a.askingPrice &&
      !/^(\d+(\.\d{1,2})?|unknown)$/i.test(a.askingPrice.trim())
    )
      errors.askingPrice = "Enter a nonnegative price or Unknown";
    if (!["Yes", "No"].includes(a.appointmentSet))
      errors.appointmentSet = "Choose Yes or No";
    if (a.appointmentSet === "Yes") {
      require("appointmentDate", "Appointment date");
      require("appointmentTime", "Appointment time");
      require("appointmentTimezone", "Appointment timezone");
      if (a.appointmentDate && !/^\d{4}-\d{2}-\d{2}$/.test(a.appointmentDate))
        errors.appointmentDate = "Use a valid date";
      if (a.appointmentDate && /^\d{4}-\d{2}-\d{2}$/.test(a.appointmentDate)) {
        const d = new Date(a.appointmentDate + "T00:00:00Z");
        if (
          !Number.isFinite(d.getTime()) ||
          d.toISOString().slice(0, 10) !== a.appointmentDate
        )
          errors.appointmentDate = "Use a valid date";
      }
      if (
        a.appointmentTime &&
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(a.appointmentTime)
      )
        errors.appointmentTime = "Use a valid time";
      try {
        if (a.appointmentTimezone)
          new Intl.DateTimeFormat("en-US", { timeZone: a.appointmentTimezone });
      } catch {
        errors.appointmentTimezone = "Use a valid IANA timezone";
      }
    }
  }
  return errors;
}
export function publicReviews(s: State, user: User) {
  return (s.callReviews ?? []).filter(
    (r) =>
      user.role === "owner" ||
      r.userId === user.id ||
      (can(user, "viewAllLeads") &&
        !!r.leadId &&
        s.leads.some((l) => l.id === r.leadId && !l.deletedAt)),
  );
}

export const reportLabels: Record<string, string> = {
  outcome: "Call outcome",
  sellerName: "Seller full name",
  sellerPhone: "Seller phone number",
  sellerAddress: "Seller full address",
  condition: "Overall condition",
  conditionDetails: "Details on condition",
  motivation: "Motivation",
  askingPrice: "Seller asking price",
  timeline: "Timeline",
  notes: "Notes",
  appointmentSet: "Appointment agreed",
  appointmentDate: "Appointment date set",
  appointmentTime: "Appointment time",
  appointmentTimezone: "Appointment timezone",
  summary: "Call summary",
  nextAction: "Recommended next step",
};
