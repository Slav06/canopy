import Papa from "papaparse";
import { State, uid } from "./model";
export type ImportRow = {
  name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  source: string;
  list: string;
  campaign: string;
  market: string;
};
export function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 10
    ? "+1" + digits
    : digits.length === 11 && digits[0] === "1"
      ? "+" + digits
      : /^\+[1-9]\d{7,14}$/.test(value)
        ? value
        : "";
}
export function addressKey(value: string) {
  return value.trim().toLowerCase().replace(/[.,]/g, "").replace(/\s+/g, " ");
}
export function parseCSV(text: string) {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });
  return {
    headers: result.meta.fields ?? [],
    rows: result.data,
    errors: result.errors.map((e) => e.message),
  };
}
export function inspectImport(rows: ImportRow[], s: State) {
  return rows.map((r, index) => {
    const row = {
      ...r,
      name: r.name.trim(),
      phone: normalizePhone(r.phone),
      email: r.email.trim().toLowerCase(),
      address: r.address.trim().replace(/\s+/g, " "),
      city: r.city.trim(),
      state: r.state.trim().toUpperCase(),
      zip: r.zip.trim(),
    };
    const errors: string[] = [];
    if (!row.name) errors.push("Seller name is required");
    if (!row.address || !row.city || !row.state || !row.zip)
      errors.push("Full property address, city, state and ZIP are required");
    if (r.phone && !row.phone)
      errors.push(
        "Phone is invalid; use country code for international numbers",
      );
    if (!row.phone && !row.email) errors.push("Phone or email is required");
    if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email))
      errors.push("Email is invalid");
    const contacts = s.contacts.filter(
      (c) =>
        (row.phone && c.phones.some((p) => p.number === row.phone)) ||
        (row.email && c.email.toLowerCase() === row.email),
    );
    const property = s.properties.find(
      (p) =>
        addressKey([p.address, p.city, p.state, p.zip].join(" ")) ===
        addressKey([row.address, row.city, row.state, row.zip].join(" ")),
    );
    const inFile = rows
      .slice(0, index)
      .some(
        (a) =>
          addressKey([a.address, a.city, a.state, a.zip].join(" ")) ===
            addressKey([row.address, row.city, row.state, row.zip].join(" ")) &&
          (normalizePhone(a.phone) === row.phone ||
            a.email.toLowerCase() === row.email),
      );
    return {
      index,
      row,
      errors,
      duplicate: contacts.length > 0 || !!property || inFile,
      ambiguous: contacts.length > 1,
      contactId: contacts.length === 1 ? contacts[0].id : undefined,
      propertyId: property?.id,
    };
  });
}
export function commitImport(
  rows: ImportRow[],
  s: State,
  assignedTo: string,
  reviewed: boolean,
) {
  const preview = inspectImport(rows, s);
  if (preview.some((r) => r.duplicate) && !reviewed)
    throw Error("Review duplicates before importing");
  const counts = { created: 0, updated: 0, skipped: 0, failed: 0 };
  for (const original of preview) {
    if (original.errors.length) {
      counts.failed++;
      continue;
    }
    const item = inspectImport([original.row], s)[0];
    if (item.errors.length) {
      counts.failed++;
      continue;
    }
    if (item.ambiguous) {
      counts.skipped++;
      continue;
    }
    const r = item.row;
    const knownProperty = s.properties.find((p) => p.id === item.propertyId);
    if (
      knownProperty &&
      (!item.contactId || !knownProperty.ownerIds.includes(item.contactId))
    ) {
      counts.skipped++;
      continue;
    }
    let c = s.contacts.find((c) => c.id === item.contactId);
    if (!c) {
      c = {
        id: uid(),
        name: r.name,
        email: r.email,
        phones: r.phone
          ? [{ id: uid(), number: r.phone, state: "preferred" }]
          : [],
        dnc: false,
      };
      s.contacts.push(c);
    }
    let p = s.properties.find((p) => p.id === item.propertyId);
    if (!p) {
      p = {
        id: uid(),
        address: r.address,
        city: r.city,
        state: r.state,
        zip: r.zip,
        ownerIds: [c.id],
        timezone: "America/Chicago",
        facts: "Imported · verify property facts and timezone",
      };
      s.properties.push(p);
    } else if (!p.ownerIds.includes(c.id)) {
      counts.skipped++;
      continue;
    }
    const existing = s.leads.find(
      (l) => l.propertyId === p!.id && l.contactId === c!.id,
    );
    if (existing) {
      counts.skipped++;
      continue;
    }
    s.leads.push({
      id: uid(),
      contactId: c.id,
      propertyId: p.id,
      status: "New",
      motivation: "",
      assignedTo,
      notes: "",
      answers: {},
      scriptVersion: s.scripts.at(-1)!.version,
      source: r.source,
      list: r.list,
      campaign: r.campaign,
      market: r.market,
      correctedFields: [],
    });
    counts.created++;
  }
  return counts;
}
