import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { seed } from "../lib/seed";
import { publicState } from "../lib/store";
import { commitImport, inspectImport, normalizePhone } from "../lib/imports";
import { callingEligibility, verifyWebhook } from "../lib/dialerr";
import { sellerMAO, detailedMAO, soldCompARV } from "../lib/model";
import {
  passwordHash,
  verifyPassword,
  assertLead,
  signSession,
  parseSession,
} from "../lib/auth";
test("caller projection omits owner financials, unassigned records, provider identities and credentials", () => {
  const s = seed();
  s.users[0].passwordHash = "secret";
  s.users[0].dialerrEmail = "private";
  const p = publicState(s, s.users[1]);
  assert.equal(p.deals.length, 0);
  assert.equal(p.buyers.length, 0);
  assert.equal(
    p.leads.some((l) => l.id === "l2"),
    false,
  );
  assert.equal(
    p.properties.some((p) => p.id === "h4"),
    false,
  );
  assert.equal("passwordHash" in p.users[0], false);
  assert.equal("dialerrEmail" in p.users[0], false);
  assert.throws(() => assertLead(s.users[1], s.leads[1]), /assigned/);
});
test("phone normalization and duplicate import preserve manual corrections and distinct properties", () => {
  const s = seed();
  s.contacts[0].name = "Corrected seller";
  s.leads[0].notes = "Property specific correction";
  const base = {
    name: "Import name",
    phone: "202-555-0101",
    email: "",
    address: "1842 Willow Creek Drive",
    city: "Fort Worth",
    state: "tx",
    zip: "76107",
    source: "CSV",
    list: "List",
    campaign: "Fall",
    market: "DFW",
  };
  assert.equal(normalizePhone(base.phone), "+12025550101");
  assert.throws(
    () => commitImport([base], s, "caller", false),
    /Review duplicates/,
  );
  const result = commitImport(
    [base, { ...base, address: "9 New Street" }],
    s,
    "caller",
    true,
  );
  assert.equal(result.created, 1);
  assert.equal(result.skipped, 1);
  assert.equal(s.contacts.length, 4);
  assert.equal(s.contacts[0].name, "Corrected seller");
  assert.equal(s.leads[0].notes, "Property specific correction");
  assert.equal(s.leads.filter((l) => l.contactId === "c1").length, 3);
});
test("repeated rows in one import do not create duplicate contacts or properties", () => {
  const s = seed();
  const r = {
    name: "New seller",
    phone: "2025550199",
    email: "",
    address: "5 Test Street",
    city: "Dallas",
    state: "TX",
    zip: "75208",
    source: "CSV",
    list: "",
    campaign: "",
    market: "",
  };
  const result = commitImport([r, r], s, "caller", true);
  assert.equal(result.created, 1);
  assert.equal(result.skipped, 1);
  assert.equal(s.contacts.filter((c) => c.name === "New seller").length, 1);
});
test("invalid import rows explain errors", () => {
  const s = seed();
  const result = inspectImport(
    [
      {
        name: "",
        phone: "123",
        email: "bad",
        address: "",
        city: "",
        state: "",
        zip: "",
        source: "",
        list: "",
        campaign: "",
        market: "",
      },
    ],
    s,
  );
  assert.ok(result[0].errors.length >= 4);
});
test("contact-level opt-out blocks every property and local calling windows are enforced", () => {
  const s = seed();
  const owner = s.users[0];
  s.contacts[0].dnc = true;
  assert.throws(() => callingEligibility(s, owner, "l1"), /Do Not Contact/);
  assert.throws(() => callingEligibility(s, owner, "l4"), /Do Not Contact/);
  s.contacts[0].dnc = false;
  assert.throws(
    () => callingEligibility(s, owner, "l1", new Date("2026-11-05T08:00:00Z")),
    /calling window/,
  );
  assert.equal(
    callingEligibility(s, owner, "l1", new Date("2026-11-05T18:00:00Z")).phone
      .number,
    "+12025550101",
  );
});
test("webhook signature uses exact raw body and rejects tampering", () => {
  const raw = '{"event":"message.received"}';
  const secret = "test-secret";
  const sig = createHmac("sha256", secret).update(raw).digest("hex");
  assert.equal(verifyWebhook(raw, sig, secret), true);
  assert.equal(verifyWebhook(raw + " ", sig, secret), false);
  assert.equal(verifyWebhook(raw, "bad", secret), false);
});
test("underwriting methods stay separate and expected money is not collected", () => {
  const d = seed().deals[0];
  assert.equal(sellerMAO(d), 136500);
  assert.equal(detailedMAO(d), 165000);
  assert.equal(d.expectedFee, 12000);
  assert.equal(d.collectedFee, 0);
});
test("sold comps estimate ARV from weighted closed-sale price per square foot", () => {
  const estimate = soldCompARV({
    subjectSqft: 1500,
    comps: [
      {
        id: "comp-1",
        address: "10 Nearby Ave",
        soldDate: "2025-08-15",
        soldPrice: 200000,
        sqft: 1000,
        beds: 3,
        baths: 2,
        distanceMiles: 0.2,
        similarity: "strong",
        source: "County record",
      },
      {
        id: "comp-2",
        address: "12 Nearby Ave",
        soldDate: "2025-09-15",
        soldPrice: 242000,
        sqft: 1100,
        beds: 3,
        baths: 2,
        distanceMiles: 0.4,
        similarity: "typical",
        source: "MLS closed sale",
      },
    ],
  });
  assert.deepEqual(estimate, {
    arv: 313300,
    pricePerSqft: 208.89,
    low: 300000,
    high: 330000,
    count: 2,
  });
  assert.equal(soldCompARV({ subjectSqft: 0, comps: [] }), null);
});
test("password hashes and signed expiring sessions reject tampering", () => {
  const hash = passwordHash("a strong test password");
  assert.equal(verifyPassword("a strong test password", hash), true);
  assert.equal(verifyPassword("incorrect", hash), false);
  process.env.SESSION_SECRET = "test-secret-at-least-thirty-two-characters";
  const token = signSession("caller");
  assert.equal(parseSession(token), "caller");
  assert.equal(parseSession(token + "x"), null);
});
import { ingestProviderEvent } from "../lib/provider-events";
test("webhook retries deduplicate and multiple-property associations stay for review", () => {
  const s = seed();
  s.providerMappings.push({ contactId: "c1", providerId: "12" });
  const e = {
    event: "lead.disposition_set",
    data: { lead: { id: 12 }, call: { id: 44 }, disposition: { id: 5 } },
  };
  const raw = JSON.stringify(e);
  assert.equal(ingestProviderEvent(s, e, raw).needsReview, true);
  const count = s.activities.length;
  assert.equal(ingestProviderEvent(s, e, raw).duplicate, true);
  assert.equal(s.activities.length, count);
  assert.equal(s.activities.at(-1)?.leadId, "unassociated");
});
test("inbound STOP applies contact-level suppression before property association", () => {
  const s = seed();
  const e = {
    event: "message.received",
    data: { message: { id: 7, body: "STOP" }, lead: { phone: "+12025550101" } },
  };
  ingestProviderEvent(s, e, JSON.stringify(e));
  assert.equal(s.contacts[0].dnc, true);
  assert.equal(s.contacts[0].phones[0].state, "opted-out");
});
test("import never commits a row that failed preview because normalization removed an invalid phone", () => {
  const s = seed();
  const row = {
    name: "Invalid phone seller",
    phone: "123",
    email: "valid@example.invalid",
    address: "1 Bad Phone Road",
    city: "Dallas",
    state: "TX",
    zip: "75208",
    source: "CSV",
    list: "",
    campaign: "",
    market: "",
  };
  assert.ok(inspectImport([row], s)[0].errors.length);
  const before = s.contacts.length;
  const result = commitImport([row], s, "caller", true);
  assert.equal(result.failed, 1);
  assert.equal(s.contacts.length, before);
});
test("ambiguous property ownership does not create orphan contacts", () => {
  const s = seed();
  const before = s.contacts.length;
  const row = {
    name: "Unconfirmed co-owner",
    phone: "2025550199",
    email: "new@example.invalid",
    address: "1842 Willow Creek Drive",
    city: "Fort Worth",
    state: "TX",
    zip: "76107",
    source: "CSV",
    list: "",
    campaign: "",
    market: "",
  };
  assert.equal(commitImport([row], s, "caller", true).skipped, 1);
  assert.equal(s.contacts.length, before);
});
import { sealBackup, openBackup } from "../lib/backup";
test("encrypted backups reject wrong passphrases and tampering", () => {
  const passphrase = "temporary-test-passphrase-at-least-20";
  const data = sealBackup({ note: "private test note" }, passphrase);
  assert.equal(data.includes(Buffer.from("private test note")), false);
  assert.equal(openBackup(data, passphrase).note, "private test note");
  assert.throws(() => openBackup(data, "wrong-passphrase-at-least-20"));
  const changed = Buffer.from(data);
  changed[changed.length - 1] ^= 1;
  assert.throws(() => openBackup(changed, passphrase));
});
import { validatePostCall, conditions, timelines } from "../lib/post-call";
test("post-call conversation report requires the hot-lead questions", () => {
  const errors = validatePostCall({
    outcome: "Seller conversation",
    summary: "Conversation",
  });
  for (const key of [
    "sellerName",
    "sellerPhone",
    "sellerAddress",
    "condition",
    "conditionDetails",
    "motivation",
    "askingPrice",
    "timeline",
    "appointmentSet",
  ])
    assert.ok(errors[key], key);
});
test("post-call no-answer does not require fabricated seller answers", () => {
  assert.deepEqual(
    validatePostCall({
      outcome: "No answer",
      summary: "No answer after ringing",
    }),
    {},
  );
  assert.ok(validatePostCall({ outcome: "No answer" }).summary);
});
test("post-call appointments require date, time and timezone only when set", () => {
  const a = {
    outcome: "Seller conversation",
    summary: "Discussed selling",
    sellerName: "Demo Seller",
    sellerPhone: "+12025550101",
    sellerAddress: "Demo address",
    condition: conditions[1],
    conditionDetails: "Seller described roof repairs",
    motivation: "Downsizing",
    askingPrice: "Unknown",
    timeline: timelines[0],
    appointmentSet: "No",
  };
  assert.deepEqual(validatePostCall(a), {});
  const e = validatePostCall({ ...a, appointmentSet: "Yes" });
  assert.ok(e.appointmentDate && e.appointmentTime && e.appointmentTimezone);
  assert.deepEqual(
    validatePostCall({
      ...a,
      appointmentSet: "Yes",
      appointmentDate: "2026-11-20",
      appointmentTime: "15:30",
      appointmentTimezone: "America/Chicago",
    }),
    {},
  );
});
