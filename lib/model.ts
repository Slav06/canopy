export const statuses = [
  "New",
  "Attempting Contact",
  "Follow-Up",
  "Qualified",
  "Appointment Set",
  "Offer Made",
  "Under Contract",
  "Marketing to Buyers",
  "Assigned",
  "Closing",
  "Closed",
  "Dead",
] as const;
export const stages = [
  "Analyzing",
  "Offer Sent",
  "Negotiating",
  "Under Contract",
  "Marketing to Buyers",
  "Assigned",
  "Closing",
  "Closed",
  "Canceled",
];
export type User = {
  id: string;
  name: string;
  email: string;
  role: "owner" | "caller" | "manager";
  capabilities?: Partial<Record<import("./permissions").Capability, boolean>>;
  dialerrEmail?: string;
  /** SHA-256 of the private access link key; the key itself is never stored. */
  accessHash?: string;
  disabled?: boolean;
};
export type Phone = {
  id: string;
  number: string;
  state: "preferred" | "valid" | "invalid" | "wrong-number" | "opted-out";
};
export type Contact = {
  id: string;
  name: string;
  email: string;
  phones: Phone[];
  dnc: boolean;
};
export type Property = {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  timezone: string;
  ownerIds: string[];
  facts: string;
  photos?: string[];
  streetViewEmbed?: string;
};
export type Lead = {
  deletedAt?: string;
  deletedBy?: string;
  id: string;
  contactId: string;
  propertyId: string;
  status: string;
  motivation: string;
  assignedTo: string;
  lastContact?: string;
  nextAction?: string;
  dueAt?: string;
  notes: string;
  answers: Record<string, string>;
  scriptVersion: number;
  source: string;
  list: string;
  campaign: string;
  market: string;
  correctedFields: string[];
};
export type Activity = {
  id: string;
  leadId: string;
  at: string;
  kind: string;
  text: string;
  userId: string;
  providerId?: string;
};
export type Appointment = {
  id: string;
  leadId: string;
  assignedTo: string;
  title: string;
  start: string;
  end: string;
  timezone: string;
  status: "scheduled" | "canceled";
  googleEventId?: string;
  calendarId?: string;
};
export type Repair = { label: string; amount: number };
export type SoldComp = {
  id: string;
  address: string;
  soldDate: string;
  soldPrice: number;
  sqft: number;
  beds: number;
  baths: number;
  distanceMiles: number;
  similarity: "strong" | "typical" | "weak";
  source: string;
};
export type Deal = {
  id: string;
  leadId: string;
  stage: string;
  asking: number;
  arv: number;
  arvSource: string;
  evidenceType: string;
  subjectSqft?: number;
  subjectBeds?: number;
  subjectBaths?: number;
  comps?: SoldComp[];
  buyerPercent: number;
  repairs: Repair[];
  contingency: number;
  targetFee: number;
  contractPrice: number;
  contractDate: string;
  inspectionDate: string;
  closingDate: string;
  earnest: number;
  titleCompany: string;
  titleIssues: string;
  buyerId: string;
  expectedFee: number;
  collectedFee: number;
  jvSplit: number;
  expenses: number;
  holding: number;
  closingCosts: number;
  buyerProfit: number;
  offers: { id: string; amount: number; at: string; status: string }[];
};
export type Buyer = {
  id: string;
  name: string;
  email: string;
  markets: string;
  zips: string;
  types: string;
  min: number;
  max: number;
  minBeds: number;
  minSize: number;
  rehab: string;
  strategy: string;
  assignments: boolean;
  funding: string;
  fundingDate: string;
  recentPurchases: string;
  communication: string;
};
export type Script = {
  version: number;
  title: string;
  questions: { key: string; label: string; prompt: string }[];
  createdAt: string;
};
export type DocumentRecord = {
  id: string;
  dealId: string;
  name: string;
  type: string;
  size: number;
  storageKey: string;
  uploadedAt: string;
};
export type Message = {
  id: string;
  leadId: string;
  body: string;
  status:
    | "draft"
    | "queued"
    | "accepted"
    | "sent"
    | "delivered"
    | "failed"
    | "unknown";
  providerId?: string;
  at: string;
  detail: string;
};
export type CallReview = {
  id: string;
  userId: string;
  leadId?: string;
  phase: "in_progress" | "required" | "submitted";
  startedAt: string;
  endedAt?: string;
  submittedAt?: string;
  answers: Record<string, string>;
  source: "browser_event" | "manual";
  formVersion: 1;
};
export type State = {
  uploadsEnabled?: boolean;
  callReviews?: CallReview[];
  archivedLeads?: Lead[];
  messages?: Message[];
  users: User[];
  contacts: Contact[];
  properties: Property[];
  leads: Lead[];
  activities: Activity[];
  appointments: Appointment[];
  deals: Deal[];
  buyers: Buyer[];
  scripts: Script[];
  documents: DocumentRecord[];
  providerMappings: { contactId: string; providerId: string }[];
  events: string[];
  settings: { callStart: number; callEnd: number; bookingAllowed: boolean };
  audit: { id: string; at: string; userId: string; action: string }[];
  revision: number;
};
export const uid = () => crypto.randomUUID();
export function sellerMAO(
  d: Pick<
    Deal,
    "arv" | "buyerPercent" | "repairs" | "contingency" | "targetFee"
  >,
) {
  return (
    (d.arv * d.buyerPercent) / 100 -
    d.repairs.reduce((s, r) => s + r.amount, 0) -
    d.contingency -
    d.targetFee
  );
}
export function detailedMAO(d: Deal) {
  return (
    d.arv -
    d.repairs.reduce((s, r) => s + r.amount, 0) -
    d.contingency -
    d.holding -
    d.closingCosts -
    d.buyerProfit -
    d.targetFee
  );
}
export function soldCompARV(
  d: Pick<Deal, "subjectSqft" | "comps">,
) {
  const subjectSqft = Number(d.subjectSqft ?? 0);
  if (!Number.isFinite(subjectSqft) || subjectSqft <= 0) return null;
  const weights = { strong: 1.25, typical: 1, weak: 0.6 } as const;
  const today = new Date().toISOString().slice(0, 10);
  const comps = (d.comps ?? []).filter(
    (c) =>
      !!c.address.trim() &&
      !!c.source.trim() &&
      c.soldPrice > 0 &&
      c.sqft > 0 &&
      c.soldDate <= today &&
      /^\d{4}-\d{2}-\d{2}$/.test(c.soldDate) &&
      !Number.isNaN(Date.parse(c.soldDate)) &&
      new Date(c.soldDate).toISOString().slice(0, 10) === c.soldDate &&
      Object.hasOwn(weights, c.similarity) &&
      Number.isFinite(c.soldPrice / c.sqft),
  );
  if (!comps.length) return null;
  const totalWeight = comps.reduce(
    (sum, c) => sum + weights[c.similarity],
    0,
  );
  const averagePpsf =
    comps.reduce(
      (sum, c) => sum + (c.soldPrice / c.sqft) * weights[c.similarity],
      0,
    ) / totalWeight;
  const toHundred = (n: number) => Math.round(n / 100) * 100;
  const values = comps.map((c) => (c.soldPrice / c.sqft) * subjectSqft);
  return {
    arv: toHundred(averagePpsf * subjectSqft),
    pricePerSqft: Math.round(averagePpsf * 100) / 100,
    low: toHundred(Math.min(...values)),
    high: toHundred(Math.max(...values)),
    count: comps.length,
  };
}
export function matchBuyer(b: Buyer, p: Property, d: Deal) {
  const reasons: string[] = [];
  const markets = b.markets
    .toLowerCase()
    .split(",")
    .map((x) => x.trim());
  if (
    !markets.includes(p.city.toLowerCase()) &&
    !b.zips
      .split(",")
      .map((x) => x.trim())
      .includes(p.zip)
  )
    return [];
  reasons.push("Market or ZIP matches");
  const price =
    (d.contractPrice || d.offers.at(-1)?.amount || d.asking) + d.expectedFee;
  if (price < b.min || price > b.max) return [];
  reasons.push("Within purchase range");
  if (!b.assignments) return [];
  reasons.push("Accepts assignments");
  return reasons;
}
