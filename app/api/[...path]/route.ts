import { dataDirectory } from "@/lib/data-directory";
import { lookupMapillary } from "@/lib/mapillary";
import { googleEmbed } from "@/lib/property-map";
import {
  pendingReview,
  requiresReview,
  validatePostCall,
  reportLabels,
} from "@/lib/post-call";
import {
  can,
  capabilityLabels,
  canBookAppointment,
  additivePatch,
  type Capability,
} from "@/lib/permissions";
import { readiness } from "@/lib/readiness";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import {
  currentUser,
  ownerOnly,
  requireCapability,
  assertLead,
  checkOrigin,
  HttpError,
  signSession,
  newAccessKey,
  accessHash,
  sessionSeconds,
} from "@/lib/auth";
import { readState, mutate, publicState, demo, pool } from "@/lib/store";
import {
  uid,
  statuses,
  stages,
  Deal,
  Buyer,
  Lead,
  Contact,
  User,
} from "@/lib/model";
import {
  inspectImport,
  commitImport,
  ImportRow,
  normalizePhone,
  addressKey,
} from "@/lib/imports";
import { verifyWebhook, eventKey } from "@/lib/dialerr";
import { encrypt, googleFetch, allowedCalendar } from "@/lib/calendar";
export const runtime = "nodejs";
const json = (v: unknown, status = 200) =>
  NextResponse.json(v, { status, headers: { "Cache-Control": "no-store" } });
const boundedString = (v: unknown, max = 20000) => {
  if (typeof v !== "string" || v.length > max)
    throw new HttpError(400, "Invalid text value");
  return v;
};
async function handle(req: NextRequest) {
  try {
    const parts = req.nextUrl.pathname.slice(5).split("/");
    const route = parts.join("/");
    const method = req.method;
    if (method !== "GET") checkOrigin(req);
    // Access is by private link: each person has one unguessable key, set as
    // a session on first open. There are no emails or passwords to manage.
    const startSession = async (u: User) =>
      (await cookies()).set("canopy_session", signSession(u), {
        httpOnly: true,
        sameSite: "lax",
        secure: req.nextUrl.protocol === "https:",
        path: "/",
        maxAge: sessionSeconds,
      });
    const activeAdmin = (u: User) =>
      u.role === "owner" && !!u.accessHash && !u.disabled;
    if (route === "auth/setup" && method === "GET") {
      if (demo) return json({ claimable: false });
      return json({ claimable: !(await readState()).users.some(activeAdmin) });
    }
    if (route === "auth/link" && method === "POST") {
      if (demo) throw new HttpError(400, "Use the demo role switch");
      const key = boundedString((await req.json()).key, 200);
      const ip =
        req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
      const limit = await pool().query(
        `INSERT INTO sessions_rate(key,count,reset_at) VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET count=CASE WHEN sessions_rate.reset_at<now() THEN 1 ELSE sessions_rate.count+1 END, reset_at=CASE WHEN sessions_rate.reset_at<now() THEN now()+interval '15 minutes' ELSE sessions_rate.reset_at END RETURNING count`,
        ["link:" + ip],
      );
      if (limit.rows[0].count > 30)
        throw new HttpError(429, "Too many attempts; retry in 15 minutes");
      const hash = accessHash(key);
      const u = (await readState()).users.find((u) => u.accessHash === hash);
      if (!u || u.disabled)
        throw new HttpError(
          401,
          "This link is no longer valid. Ask your admin for a new one.",
        );
      await startSession(u);
      return json({ ok: true });
    }
    if (route === "auth/claim" && method === "POST") {
      // First visit only: whoever opens a brand-new workspace becomes its Admin.
      if (demo) throw new HttpError(400, "Use the demo role switch");
      const name = boundedString((await req.json()).name, 200).trim();
      if (!name) throw new HttpError(400, "Enter your name");
      const { key, hash } = newAccessKey();
      const admin = await mutate((s) => {
        if (s.users.some(activeAdmin))
          throw new HttpError(409, "This workspace already has an admin");
        const u: User = {
          id: uid(),
          name,
          email: "",
          role: "owner",
          capabilities: {},
          accessHash: hash,
        };
        s.users.push(u);
        return u;
      });
      await startSession(admin);
      return json({ key });
    }
    if (route === "health" && method === "GET") {
      try {
        if (demo) return json({ status: "demo" }, 503);
        if ((process.env.SESSION_SECRET?.length ?? 0) < 32)
          return json({ status: "unavailable" }, 503);
        // "setup" is healthy: the database works and the Admin link is unclaimed.
        const state = await readState();
        return json({ status: state.users.some(activeAdmin) ? "ok" : "setup" });
      } catch {
        return json({ status: "unavailable" }, 503);
      }
    }
    const user = await currentUser();
    if (route === "auth/logout" && method === "POST") {
      (await cookies()).delete("canopy_session");
      return json({ ok: true });
    }
    if (route === "auth/new-link" && method === "POST") {
      // Replace your own link; the old link and every session on it stop working.
      if (demo) throw new HttpError(400, "Demo roles have no private link");
      const { key, hash } = newAccessKey();
      const me = await mutate((s) => {
        const u = s.users.find((u) => u.id === user.id);
        if (!u) throw new HttpError(401, "Sign in to continue");
        u.accessHash = hash;
        s.audit.push({
          id: uid(),
          at: new Date().toISOString(),
          userId: user.id,
          action: "Replaced own access link",
        });
        return u;
      });
      await startSession(me);
      return json({ key });
    }
    if (route === "demo/role" && method === "POST") {
      if (!demo) throw new HttpError(403, "Demo only");
      const b = await req.json();
      (await cookies()).set(
        "canopy_demo_role",
        ["caller", "manager"].includes(b.role) ? b.role : "owner",
        { httpOnly: true, sameSite: "strict", path: "/" },
      );
      return json({ ok: true });
    }
    if (parts[0] === "property-streetview" && parts[1] && method === "GET") {
      const s = await readState();
      const leads = s.leads.filter(
        (l) => l.propertyId === parts[1] && !l.deletedAt,
      );
      if (
        !leads.some(
          (l) => can(user, "viewAllLeads") || l.assignedTo === user.id,
        )
      )
        throw new HttpError(403, "Property is not assigned to you");
      const property = s.properties.find((p) => p.id === parts[1]);
      if (!property) throw new HttpError(404, "Property not found");
      try {
        return json(
          await lookupMapillary(property, process.env.MAPILLARY_CLIENT_TOKEN),
        );
      } catch {
        return json({
          status: "unavailable",
          message:
            "Street-level imagery is temporarily unavailable. Showing satellite imagery.",
        });
      }
    }

    if (route === "readiness" && method === "GET") {
      ownerOnly(user);
      return json(await readiness());
    }
    if (route === "state" && method === "GET") {
      const s = await readState();
      return json({
        state: publicState(s, user),
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          capabilities: user.capabilities ?? {},
        },
        mode: demo ? "demo" : "live",
        integration: {
          embedEnabled: true,
          dialerrKey: process.env.DIALERR_PUBLISHABLE_KEY || undefined,
          dialerr: true,
          liveCalling: !demo && process.env.LIVE_CALLING_ENABLED === "true",
          roleVerified: process.env.DIALERR_ROLE_BOUNDARY_VERIFIED === "true",
          calendar: !!process.env.GOOGLE_CLIENT_ID,
        },
      });
    }
    // Canopy never starts, prepares or loads a call. Calling and messaging
    // happen only inside the embedded Dialerr panel.
    if (parts[0] === "dialerr" || parts[0] === "messages")
      throw new HttpError(
        410,
        "Use calling and messaging inside the embedded Dialerr panel.",
      );
    if (route === "export" && method === "GET") {
      requireCapability(user, "exportData");
      return json(publicState(await readState(), user));
    }
    if (route === "documents" && method === "POST") {
      if (process.env.PRIVATE_UPLOADS_ENABLED === "false")
        throw new HttpError(
          409,
          "Private file uploads are disabled on this test host because its file storage is temporary.",
        );
      requireCapability(user, "manageDeals");
      const data = await req.formData();
      const file = data.get("file");
      const dealId = String(data.get("dealId") ?? "");
      if (!(file instanceof File) || file.size > 10 * 1024 * 1024)
        throw new HttpError(400, "Choose a file under 10 MB");
      if (
        ![
          "application/pdf",
          "image/jpeg",
          "image/png",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ].includes(file.type)
      )
        throw new HttpError(400, "Use PDF, PNG, JPEG or DOCX");
      const id = uid();
      const key = id + ".bin";
      const folder = path.join(dataDirectory(), "documents");
      await mkdir(folder, { recursive: true, mode: 0o700 });
      await writeFile(
        path.join(folder, key),
        Buffer.from(await file.arrayBuffer()),
        { mode: 0o600 },
      );
      return json(
        await mutate((s) => {
          if (!s.deals.some((d) => d.id === dealId))
            throw new HttpError(404, "Deal not found");
          const doc = {
            id,
            dealId,
            name: file.name,
            type: file.type,
            size: file.size,
            storageKey: key,
            uploadedAt: new Date().toISOString(),
          };
          s.documents.push(doc);
          return doc;
        }),
      );
    }
    if (parts[0] === "documents" && parts[1] && method === "GET") {
      requireCapability(user, "manageDeals");
      const s = await readState();
      const doc = s.documents.find((d) => d.id === parts[1]);
      if (!doc) throw new HttpError(404, "Document not found");
      const data = await readFile(
        path.join(dataDirectory(), "documents", doc.storageKey),
      );
      return new NextResponse(data, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="${doc.name.replace(/[^a-zA-Z0-9._ -]/g, "_")}"`,
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    if (route === "calendar/connect" && method === "GET") {
      ownerOnly(user);
      if (demo)
        throw new HttpError(
          409,
          "Google connection is available only in a configured live workspace",
        );
      if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET)
        throw new HttpError(503, "Configure Google OAuth first");
      const nonce = randomBytes(24).toString("hex");
      (await cookies()).set("google_oauth_state", nonce, {
        httpOnly: true,
        sameSite: "lax",
        secure: req.nextUrl.protocol === "https:",
        maxAge: 600,
        path: "/",
      });
      const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      url.search = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        redirect_uri: process.env.APP_ORIGIN + "/api/calendar/callback",
        response_type: "code",
        scope:
          "https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events.owned https://www.googleapis.com/auth/calendar.freebusy",
        access_type: "offline",
        prompt: "consent",
        state: nonce,
      }).toString();
      return NextResponse.redirect(url);
    }
    if (route === "calendar/callback" && method === "GET") {
      ownerOnly(user);
      const expected = (await cookies()).get("google_oauth_state")?.value;
      (await cookies()).delete("google_oauth_state");
      if (!expected || req.nextUrl.searchParams.get("state") !== expected)
        throw new HttpError(403, "OAuth state mismatch");
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          code: req.nextUrl.searchParams.get("code") ?? "",
          redirect_uri: process.env.APP_ORIGIN + "/api/calendar/callback",
          grant_type: "authorization_code",
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new HttpError(502, "Google connection failed");
      const tokens = await response.json();
      tokens.expires_at = Date.now() + tokens.expires_in * 1000;
      await pool().query(
        "INSERT INTO google_connections(user_id,encrypted_tokens) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET encrypted_tokens=$2",
        [user.id, encrypt(JSON.stringify(tokens))],
      );
      return NextResponse.redirect(process.env.APP_ORIGIN + "/?view=Calendar");
    }
    if (route === "calendar/calendars" && method === "GET") {
      ownerOnly(user);
      if (demo)
        throw new HttpError(409, "Demo has no connected Google calendars");
      return json(await googleFetch(user.id, "users/me/calendarList"));
    }
    if (route === "calendar/permit" && method === "POST") {
      ownerOnly(user);
      const b = await req.json();
      const list = await googleFetch(user.id, "users/me/calendarList");
      if (
        !list.items.some(
          (c: { id: string; accessRole: string }) =>
            c.id === b.calendarId && c.accessRole === "owner",
        )
      )
        throw new HttpError(403, "Select a calendar you own");
      await pool().query(
        "UPDATE google_connections SET calendars=$1 WHERE user_id=$2",
        [JSON.stringify([b.calendarId]), user.id],
      );
      return json({ ok: true });
    }
    if (route === "calendar/disconnect" && method === "POST") {
      ownerOnly(user);
      if (!demo)
        await pool().query("DELETE FROM google_connections WHERE user_id=$1", [
          user.id,
        ]);
      return json({ ok: true });
    }
    if (route === "calendar/team-availability" && method === "POST") {
      const s = await readState();
      if (!canBookAppointment(user, s.settings.bookingAllowed))
        throw new HttpError(403, "Calendar booking is disabled");
      const b = await req.json();
      const start = Date.parse(b.start),
        end = Date.parse(b.end);
      if (
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        end <= start ||
        end - start > 32 * 86400000
      )
        throw new HttpError(400, "Choose a valid range up to 32 days");
      if (!s.users.some((u) => u.id === b.assignedTo && !u.disabled))
        throw new HttpError(400, "Choose an active agent");
      return json({
        busy: s.appointments
          .filter(
            (a) =>
              a.assignedTo === b.assignedTo &&
              a.status === "scheduled" &&
              Date.parse(a.start) < end &&
              Date.parse(a.end) > start,
          )
          .map((a) => ({ start: a.start, end: a.end })),
      });
    }
    if (route === "calendar/availability" && method === "POST") {
      ownerOnly(user);
      const b = await req.json();
      await allowedCalendar(user.id, b.calendarId);
      return json(
        await googleFetch(user.id, "freeBusy", {
          method: "POST",
          body: JSON.stringify({
            timeMin: b.start,
            timeMax: b.end,
            items: [{ id: b.calendarId }],
          }),
        }),
      );
    }
    if (route === "calendar/sync" && method === "POST") {
      ownerOnly(user);
      if (demo) throw new HttpError(409, "Demo appointments stay in the CRM");
      const b = await req.json();
      await allowedCalendar(user.id, b.calendarId);
      return json(
        await mutate(async (s) => {
          const a = s.appointments.find((a) => a.id === b.id);
          if (!a) throw new HttpError(404, "Appointment not found");
          if (a.calendarId && a.calendarId !== b.calendarId)
            throw new HttpError(
              409,
              "An event is already linked to another calendar",
            );
          const eventId =
            a.googleEventId ?? createHash("sha256").update(a.id).digest("hex");
          let response;
          if (a.status === "canceled") {
            if (a.googleEventId)
              try {
                await googleFetch(
                  user.id,
                  `calendars/${encodeURIComponent(b.calendarId)}/events/${eventId}?sendUpdates=none`,
                  { method: "DELETE" },
                );
              } catch (e) {
                if (!(e instanceof HttpError) || ![404, 410].includes(e.status))
                  throw e;
              }
            return { ok: true };
          }
          const event = {
            id: eventId,
            summary: a.title,
            description: "Canopy lead " + a.leadId,
            start: { dateTime: a.start, timeZone: a.timezone },
            end: { dateTime: a.end, timeZone: a.timezone },
          };
          try {
            response = await googleFetch(
              user.id,
              `calendars/${encodeURIComponent(b.calendarId)}/events${a.googleEventId ? "/" + eventId : ""}?sendUpdates=none`,
              {
                method: a.googleEventId ? "PUT" : "POST",
                body: JSON.stringify(event),
              },
            );
          } catch (e) {
            if (e instanceof HttpError && e.status === 409) {
              response = await googleFetch(
                user.id,
                `calendars/${encodeURIComponent(b.calendarId)}/events/${eventId}`,
              );
            } else throw e;
          }
          a.googleEventId = response.id;
          a.calendarId = b.calendarId;
          return { ok: true };
        }),
      );
    }
    if (method === "GET") throw new HttpError(404, "Not found");
    const body = await req.json();
    return json(
      await mutate((s) => {
        const audit = (action: string) =>
          s.audit.push({
            id: uid(),
            at: new Date().toISOString(),
            userId: user.id,
            action,
          });
        const activity = (leadId: string, kind: string, text: string) =>
          s.activities.push({
            id: uid(),
            leadId,
            kind,
            text,
            userId: user.id,
            at: new Date().toISOString(),
          });
        if (
          parts[0] === "team" &&
          parts[1] === "users" &&
          parts[2] &&
          method === "PATCH"
        ) {
          ownerOnly(user);

          const member = s.users.find((u) => u.id === parts[2]);
          if (!member || member.role === "owner")
            throw new HttpError(400, "Select a caller account");
          if (
            Object.keys(body).some(
              (k) => !["disabled", "role", "capabilities"].includes(k),
            )
          )
            throw new HttpError(400, "Unknown account control");
          if (body.disabled !== undefined) {
            if (typeof body.disabled !== "boolean")
              throw new HttpError(400, "Invalid account state");
            member.disabled = body.disabled;
          }
          if (body.role !== undefined) {
            if (!["caller", "manager"].includes(body.role))
              throw new HttpError(
                400,
                "Choose Basic Agent or Upper Management",
              );
            member.role = body.role;
            if (member.role === "caller") member.capabilities = {};
          }
          if (body.capabilities !== undefined) {
            if (
              member.role !== "manager" ||
              !body.capabilities ||
              typeof body.capabilities !== "object" ||
              Array.isArray(body.capabilities) ||
              Object.entries(body.capabilities).some(
                ([key, value]) =>
                  !(key in capabilityLabels) || typeof value !== "boolean",
              )
            )
              throw new HttpError(400, "Invalid management capabilities");
            member.capabilities = {
              ...member.capabilities,
              ...body.capabilities,
            };
          }
          audit("Admin updated permissions for " + member.id);
          return { ok: true };
        }
        if (
          parts[0] === "team" &&
          parts[1] === "users" &&
          parts[2] &&
          parts[3] === "link" &&
          method === "POST"
        ) {
          ownerOnly(user);
          const member = s.users.find((u) => u.id === parts[2]);
          if (!member || member.role === "owner")
            throw new HttpError(400, "Select an agent account");
          const { key, hash } = newAccessKey();
          member.accessHash = hash;
          audit("Admin replaced access link for " + member.id);
          return { id: member.id, name: member.name, key };
        }
        if (route === "team/users" && method === "POST") {
          ownerOnly(user);
          if (demo)
            throw new HttpError(
              409,
              "Live login accounts require a live workspace. Demo roles are simulated.",
            );
          const name = boundedString(body.name, 200).trim();
          if (!name) throw new HttpError(400, "Enter a name");
          if (s.users.some((u) => u.name.toLowerCase() === name.toLowerCase()))
            throw new HttpError(409, "Someone with that name already exists");
          const { key, hash } = newAccessKey();
          const member: User = {
            id: uid(),
            name,
            email: "",
            role: body.role === "manager" ? "manager" : "caller",
            capabilities: {},
            accessHash: hash,
          };
          s.users.push(member);
          audit("Owner created caller " + member.id);
          return { id: member.id, name, role: member.role, key };
        }
        if (route === "call-reviews/ready") {
          if (requiresReview(user) && pendingReview(s, user))
            throw new HttpError(
              409,
              "Submit the required post-call form first",
            );
          return { ok: true };
        }
        if (route === "call-reviews/start") {
          const existing = pendingReview(s, user);
          const id = boundedString(body.id, 100);
          if (existing) {
            if (existing.id === id) return existing;
            throw new HttpError(
              409,
              "Complete the pending post-call form first",
            );
          }
          if (s.callReviews?.some((r) => r.id === id))
            throw new HttpError(409, "Call review ID already used");
          if (body.leadId)
            assertLead(
              user,
              s.leads.find((l) => l.id === body.leadId),
            );
          const r = {
            id,
            userId: user.id,
            leadId: body.leadId || undefined,
            phase:
              body.ended === true
                ? ("required" as const)
                : ("in_progress" as const),
            startedAt: new Date().toISOString(),
            endedAt: body.ended === true ? new Date().toISOString() : undefined,
            answers: {},
            source:
              body.source === "browser_event"
                ? ("browser_event" as const)
                : ("manual" as const),
            formVersion: 1 as const,
          };
          s.callReviews ??= [];
          s.callReviews.push(r);
          audit("Started post-call form " + id);
          return r;
        }
        if (parts[0] === "call-reviews" && parts[1]) {
          const r = s.callReviews?.find((r) => r.id === parts[1]);
          if (!r || r.userId !== user.id)
            throw new HttpError(403, "This call form belongs to another agent");
          if (r.phase === "submitted") {
            if (["submit", "end"].includes(parts[2])) return r;
            throw new HttpError(409, "Submitted call forms are immutable");
          }
          if (parts[2] === "end") {
            r.phase = "required";
            r.endedAt ??= new Date().toISOString();
            return r;
          }
          if (parts[2] === "draft" || parts[2] === "submit") {
            if (
              !body.answers ||
              typeof body.answers !== "object" ||
              Array.isArray(body.answers) ||
              Object.entries(body.answers).some(
                ([k, v]) =>
                  k.length > 100 || typeof v !== "string" || v.length > 20000,
              )
            )
              throw new HttpError(400, "Invalid form answers");
            const permitted = [
              "outcome",
              "summary",
              "sellerName",
              "sellerPhone",
              "sellerAddress",
              "condition",
              "conditionDetails",
              "motivation",
              "askingPrice",
              "timeline",
              "notes",
              "appointmentSet",
              "appointmentDate",
              "appointmentTime",
              "appointmentTimezone",
              "nextAction",
            ];
            if (Object.keys(body.answers).some((k) => !permitted.includes(k)))
              throw new HttpError(400, "Unknown form question");
            const target = body.leadId || r.leadId;
            if (target)
              assertLead(
                user,
                s.leads.find((l) => l.id === target),
              );
            r.leadId = target;
            r.answers = { ...r.answers, ...body.answers };
            if (parts[2] === "draft") return r;
            if (!r.leadId)
              throw new HttpError(
                400,
                "Select the correct CRM lead for this call",
              );
            const errors = validatePostCall(r.answers);
            if (Object.keys(errors).length)
              throw new HttpError(400, Object.values(errors).join("; "));
            r.phase = "submitted";
            r.endedAt ??= new Date().toISOString();
            r.submittedAt = new Date().toISOString();
            activity(
              r.leadId,
              "Post-call form completed",
              Object.entries(r.answers)
                .filter(([, v]) => v.trim())
                .map(([k, v]) => (reportLabels[k] ?? k) + ": " + v)
                .join("\n"),
            );
            if (r.answers.outcome === "Do Not Contact") {
              const l = s.leads.find((l) => l.id === r.leadId)!;
              s.contacts.find((c) => c.id === l.contactId)!.dnc = true;
            }
            audit("Submitted post-call form " + r.id);
            return r;
          }
        }
        if (route === "leads" && method === "POST") {
          requireCapability(user, "createLeads");
          const name = boundedString(body.name, 200).trim();
          const address = boundedString(body.address, 500).trim();
          if (!name || !address)
            throw new HttpError(
              400,
              "Seller name and property address are required",
            );
          if (body.phone && !normalizePhone(body.phone))
            throw new HttpError(400, "Enter a valid phone number");
          const email = boundedString(body.email ?? "", 254)
            .trim()
            .toLowerCase();
          if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
            throw new HttpError(400, "Enter a valid email");
          try {
            new Intl.DateTimeFormat("en-US", {
              timeZone: body.timezone ?? "America/Chicago",
            });
          } catch {
            throw new HttpError(400, "Enter a valid IANA timezone");
          }
          const phone = normalizePhone(body.phone ?? "");
          const matches = s.contacts.filter(
            (c) =>
              (phone && c.phones.some((p) => p.number === phone)) ||
              (email && c.email.toLowerCase() === email),
          );
          if (matches.length > 1)
            throw new HttpError(
              409,
              "Multiple contacts match; review contacts before adding",
            );
          const existingProperty = s.properties.find(
            (p) =>
              addressKey([p.address, p.city, p.state, p.zip].join(" ")) ===
              addressKey(
                [
                  address,
                  body.city ?? "",
                  body.state ?? "",
                  body.zip ?? "",
                ].join(" "),
              ),
          );
          if (existingProperty)
            throw new HttpError(
              409,
              "This property already exists. Open its lead to preserve ownership and notes.",
            );
          const c = matches[0] ?? {
            id: uid(),
            name,
            email,
            dnc: false,
            phones: body.phone
              ? [
                  {
                    id: uid(),
                    number: normalizePhone(body.phone),
                    state: "preferred" as const,
                  },
                ]
              : [],
          };
          const p = {
            id: uid(),
            address,
            city: body.city ?? "",
            state: body.state ?? "",
            zip: body.zip ?? "",
            timezone: body.timezone ?? "America/Chicago",
            ownerIds: [c.id],
            facts: "",
          };
          const lead = {
            id: uid(),
            contactId: c.id,
            propertyId: p.id,
            status: "New",
            motivation: "",
            assignedTo: user.id,
            notes: "",
            answers: {},
            scriptVersion: s.scripts.at(-1)!.version,
            source: "Manual",
            list: "",
            campaign: "",
            market: "",
            correctedFields: [],
          };
          if (!matches.length) s.contacts.push(c);
          s.properties.push(p);
          s.leads.push(lead);
          audit("Created lead " + lead.id);
          return lead;
        }
        if (parts[0] === "leads" && parts[1]) {
          const lead = s.leads.find((l) => l.id === parts[1]);
          if (method === "DELETE" || parts[2] === "restore") {
            ownerOnly(user);
            if (!lead) throw new HttpError(404, "Lead not found");
            if (parts[2] === "restore") {
              if (method !== "POST") throw new HttpError(405, "Use POST");
              delete lead.deletedAt;
              delete lead.deletedBy;
              audit("Admin restored lead " + lead.id);
            } else {
              if (
                (s.callReviews ?? []).some(
                  (r) => r.leadId === lead.id && r.phase !== "submitted",
                )
              )
                throw new HttpError(
                  409,
                  "Complete the pending call report before deleting this lead",
                );
              lead.deletedAt = new Date().toISOString();
              lead.deletedBy = user.id;
              audit("Admin deleted lead (recoverable) " + lead.id);
            }
            return { ok: true };
          }
          assertLead(user, lead);
          const l = lead!;
          if (parts[2] === "notes" && method === "POST") {
            const note = boundedString(body.text).trim();
            if (!note) throw new HttpError(400, "Add a note first");
            l.notes += (l.notes ? "\n\n" : "") + note;
            activity(l.id, "Note added", note);
            audit("Added note to " + l.id);
            return l;
          }

          if (method === "PATCH") {
            const allowed = [
              "notes",
              "answers",
              "status",
              "motivation",
              "nextAction",
              "dueAt",
            ];
            if (can(user, "assignLeads")) allowed.push("assignedTo");
            if (!can(user, "editLeads")) {
              const addBody = { ...body };
              delete addBody.assignedTo;
              if (!additivePatch(l, addBody))
                throw new HttpError(
                  403,
                  "Basic agents can only fill empty fields or append notes",
                );
              if (body.answers)
                body.answers = { ...l.answers, ...body.answers };
            }
            for (const k of Object.keys(body)) {
              if (!allowed.includes(k))
                throw new HttpError(400, "Field is not editable: " + k);
              if (k === "answers") {
                if (
                  !body.answers ||
                  typeof body.answers !== "object" ||
                  Array.isArray(body.answers) ||
                  Object.values(body.answers).some(
                    (v) => typeof v !== "string" || v.length > 20000,
                  )
                )
                  throw new HttpError(400, "Invalid answers");
              } else boundedString(body[k]);
              if (k === "status" && !statuses.includes(body[k]))
                throw new HttpError(400, "Unknown status");
              if (k === "assignedTo" && !s.users.some((u) => u.id === body[k]))
                throw new HttpError(400, "Unknown assignee");
              if (
                k === "dueAt" &&
                body[k] &&
                !Number.isFinite(Date.parse(body[k]))
              )
                throw new HttpError(400, "Invalid due date");
            }
            if (
              body.assignedTo &&
              body.assignedTo !== l.assignedTo &&
              (s.callReviews ?? []).some(
                (r) => r.leadId === l.id && r.phase !== "submitted",
              )
            )
              throw new HttpError(
                409,
                "Complete the pending call report before reassigning this lead",
              );
            const old = l.status;
            if (body.notes !== undefined && body.notes !== l.notes)
              activity(l.id, "Note updated", body.notes);
            Object.assign(l, body);
            l.correctedFields = [
              ...new Set([...l.correctedFields, ...Object.keys(body)]),
            ];
            if (old !== l.status)
              activity(l.id, "Status change", old + " → " + l.status);
            audit("Updated lead " + l.id);
            return l;
          }
          if (parts[2] === "complete-action" && method === "POST") {
            requireCapability(user, "editLeads");
            if (!l.nextAction)
              throw new HttpError(409, "This action is already complete");
            activity(l.id, "Action completed", l.nextAction);
            l.nextAction = "";
            l.dueAt = "";
            audit("Completed action on " + l.id);
            return l;
          }
          if (parts[2] === "outcome") {
            const outcome = boundedString(body.outcome, 200);
            if (
              ![
                "No answer",
                "Voicemail",
                "Interested",
                "Not interested",
                "Wrong number",
                "Do Not Contact",
              ].includes(outcome)
            )
              throw new HttpError(400, "Unknown outcome");
            if (outcome === "Do Not Contact") {
              s.contacts.find((c) => c.id === l.contactId)!.dnc = true;
            }
            if (outcome === "Wrong number" && can(user, "editLeads")) {
              s.contacts
                .find((c) => c.id === l.contactId)!
                .phones.forEach((p) => {
                  if (p.state === "preferred") p.state = "wrong-number";
                });
            }
            if (requiresReview(user)) {
              let r = pendingReview(s, user);
              if (r && r.leadId && r.leadId !== l.id)
                throw new HttpError(
                  409,
                  "Complete the pending post-call form first",
                );
              if (!r) {
                r = {
                  id: uid(),
                  userId: user.id,
                  leadId: l.id,
                  phase: "required",
                  startedAt: new Date().toISOString(),
                  answers: {},
                  source: "manual",
                  formVersion: 1,
                };
                s.callReviews ??= [];
                s.callReviews.push(r);
              }
              r.phase = "required";
              r.endedAt ??= new Date().toISOString();
              r.answers.outcome =
                outcome === "Interested" ? "Seller conversation" : outcome;
            }
            l.lastContact = new Date().toISOString();
            if (can(user, "editLeads")) {
              if (outcome === "Interested") l.status = "Qualified";
              else if (outcome === "Not interested") l.status = "Dead";
              else if (outcome !== "Do Not Contact")
                l.status = "Attempting Contact";
            }
            activity(
              l.id,
              demo ? "Demo call outcome" : "Owner-recorded call outcome",
              outcome,
            );
            return l;
          }
        }
        if (parts[0] === "properties" && parts[1] && method === "PATCH") {
          requireCapability(user, "editLeads");
          const property = s.properties.find((p) => p.id === parts[1]);
          if (
            !can(user, "viewAllLeads") &&
            !s.leads.some(
              (l) =>
                !l.deletedAt &&
                l.propertyId === parts[1] &&
                l.assignedTo === user.id,
            )
          )
            throw new HttpError(403, "Property is not assigned to you");
          if (!property) throw new HttpError(404, "Property not found");
          const allowed = [
            "address",
            "city",
            "state",
            "zip",
            "timezone",
            "facts",
            "ownerIds",
            "streetViewEmbed",
          ];
          if (Object.keys(body).some((k) => !allowed.includes(k)))
            throw new HttpError(400, "Invalid property field");
          for (const k of Object.keys(body)) {
            if (k === "ownerIds") {
              if (
                !Array.isArray(body.ownerIds) ||
                !body.ownerIds.length ||
                body.ownerIds.some(
                  (id: string) => !s.contacts.some((c) => c.id === id),
                )
              )
                throw new HttpError(400, "Select valid owners");
            } else boundedString(body[k], 2000);
          }
          if (body.streetViewEmbed !== undefined) {
            try {
              body.streetViewEmbed = googleEmbed(body.streetViewEmbed);
            } catch (e) {
              throw new HttpError(400, (e as Error).message);
            }
          }
          if (body.timezone) {
            try {
              new Intl.DateTimeFormat("en-US", { timeZone: body.timezone });
            } catch {
              throw new HttpError(400, "Invalid property timezone");
            }
          }
          Object.assign(property, body);
          audit("Updated property " + property.id);
          return property;
        }
        if (parts[0] === "contacts" && parts[1] && method === "PATCH") {
          const c = s.contacts.find((c) => c.id === parts[1]);
          if (!c) throw new HttpError(404, "Contact not found");
          const linked = s.leads.filter((l) => l.contactId === c.id);
          if (
            !can(user, "viewAllLeads") &&
            !linked.some((l) => l.assignedTo === user.id)
          )
            throw new HttpError(403, "Contact not assigned");
          if (
            Object.keys(body).some(
              (k) => !["dnc", "name", "email", "phones"].includes(k),
            )
          )
            throw new HttpError(400, "Invalid contact field");
          if (
            !can(user, "editLeads") &&
            (body.dnc !== true || Object.keys(body).length !== 1)
          )
            throw new HttpError(
              403,
              "Callers may suppress a contact; owner manages contact data",
            );
          if (
            body.phones &&
            (!Array.isArray(body.phones) ||
              body.phones.some(
                (p: Contact["phones"][number]) =>
                  ![
                    "preferred",
                    "valid",
                    "invalid",
                    "wrong-number",
                    "opted-out",
                  ].includes(p.state),
              ))
          )
            throw new HttpError(400, "Invalid phone state");
          if (body.dnc === false) ownerOnly(user);
          if (body.dnc !== undefined && typeof body.dnc !== "boolean")
            throw new HttpError(400, "Invalid Do Not Contact flag");
          if (body.name !== undefined && !boundedString(body.name, 200).trim())
            throw new HttpError(400, "Seller name is required");
          if (body.email !== undefined) {
            body.email = boundedString(body.email, 254).trim().toLowerCase();
            if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email))
              throw new HttpError(400, "Invalid email");
          }
          if (body.phones) {
            if (
              body.phones.some(
                (p: Contact["phones"][number]) =>
                  !p.id || !normalizePhone(p.number),
              )
            )
              throw new HttpError(400, "Invalid phone number");
            if (
              body.phones.filter(
                (p: Contact["phones"][number]) => p.state === "preferred",
              ).length > 1
            )
              throw new HttpError(400, "Choose one preferred phone");
            body.phones = body.phones.map((p: Contact["phones"][number]) => ({
              ...p,
              number: normalizePhone(p.number),
            }));
          }
          Object.assign(c, body);
          audit("Updated contact " + c.id);
          return c;
        }
        if (route === "followups") {
          requireCapability(user, "manageAppointments");
          const l = s.leads.find((l) => l.id === body.leadId);
          assertLead(user, l);
          if (!s.users.some((u) => u.id === body.assignedTo))
            throw new HttpError(400, "Choose an assignee");
          if (!can(user, "assignLeads") && body.assignedTo !== user.id)
            throw new HttpError(
              403,
              "Callers may assign follow-ups only to themselves",
            );
          if (!Number.isFinite(Date.parse(body.dueAt)))
            throw new HttpError(400, "Choose a valid date and time");
          l!.nextAction = boundedString(body.reason, 1000);
          if (!l!.nextAction.trim())
            throw new HttpError(400, "A reason is required");
          l!.dueAt = body.dueAt;
          l!.assignedTo = body.assignedTo;
          l!.status = "Follow-Up";
          activity(
            l!.id,
            "Follow-up scheduled",
            body.reason + (body.notes ? " · " + boundedString(body.notes) : ""),
          );
          return { ok: true };
        }
        if (route === "appointments") {
          if (method !== "POST") throw new HttpError(405, "Use POST to book");
          if (!canBookAppointment(user, s.settings.bookingAllowed))
            throw new HttpError(403, "Calendar booking is disabled");
          const l = s.leads.find((l) => l.id === body.leadId);
          assertLead(user, l);
          if (user.role === "caller" && !s.settings.bookingAllowed)
            throw new HttpError(403, "Caller booking is disabled");
          const start = Date.parse(body.start),
            end = Date.parse(body.end);
          if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
            throw new HttpError(400, "End must be after start");
          if (!s.users.some((u) => u.id === body.assignedTo && !u.disabled))
            throw new HttpError(400, "Choose an active agent");
          try {
            new Intl.DateTimeFormat("en-US", { timeZone: body.timezone });
          } catch {
            throw new HttpError(400, "Invalid timezone");
          }
          const id = boundedString(body.id, 100);
          const existing = s.appointments.find((a) => a.id === id);
          if (existing) {
            if (existing.leadId !== l!.id)
              throw new HttpError(409, "Appointment ID already used");
            return existing;
          }
          if (
            s.appointments.some(
              (a) =>
                a.assignedTo === body.assignedTo &&
                a.status === "scheduled" &&
                Date.parse(a.start) < end &&
                Date.parse(a.end) > start,
            )
          )
            throw new HttpError(
              409,
              "This agent already has an appointment at that time. Choose another time or agent.",
            );
          if (!body.title?.trim())
            throw new HttpError(400, "Appointment title is required");
          const a = {
            id,
            leadId: l!.id,
            assignedTo: body.assignedTo,
            title: boundedString(body.title, 500),
            start: new Date(start).toISOString(),
            end: new Date(end).toISOString(),
            timezone: body.timezone,
            status: "scheduled" as const,
          };
          s.appointments.push(a);
          if (can(user, "manageAppointments")) {
            l!.status = "Appointment Set";
            l!.nextAction = a.title;
            l!.dueAt = a.start;
          }
          activity(
            l!.id,
            "Appointment booked",
            a.title +
              " · " +
              a.start +
              " · Calendar: " +
              s.users.find((u) => u.id === a.assignedTo)!.name,
          );
          audit("Booked appointment " + a.id + " on " + a.assignedTo);
          return a;
        }
        if (parts[0] === "appointments" && parts[1] && method === "PATCH") {
          requireCapability(user, "manageAppointments");
          const a = s.appointments.find((a) => a.id === parts[1]);
          if (!a) throw new HttpError(404, "Appointment not found");
          assertLead(
            user,
            s.leads.find((l) => l.id === a.leadId),
          );
          if (user.role === "caller" && !s.settings.bookingAllowed)
            throw new HttpError(403, "Booking disabled");
          if (body.status === "canceled") a.status = "canceled";
          else {
            if (
              !Number.isFinite(Date.parse(body.start)) ||
              !Number.isFinite(Date.parse(body.end)) ||
              Date.parse(body.end) <= Date.parse(body.start)
            )
              throw new HttpError(400, "Invalid time");
            if (
              s.appointments.some(
                (other) =>
                  other.id !== a.id &&
                  other.assignedTo === a.assignedTo &&
                  other.status === "scheduled" &&
                  Date.parse(other.start) < Date.parse(body.end) &&
                  Date.parse(other.end) > Date.parse(body.start),
              )
            )
              throw new HttpError(
                409,
                "This agent already has an appointment at that time",
              );
            a.start = body.start;
            a.end = body.end;
          }
          const linked = s.leads.find((l) => l.id === a.leadId)!;
          if (linked.nextAction === a.title) {
            if (a.status === "canceled") {
              linked.nextAction = "";
              linked.dueAt = "";
              if (linked.status === "Appointment Set")
                linked.status = "Follow-Up";
            } else linked.dueAt = a.start;
          }
          activity(
            a.leadId,
            "Appointment changed",
            a.status === "canceled"
              ? "Canceled " + a.title
              : "Rescheduled " + a.title,
          );
          return a;
        }
        if (route === "imports/preview" || route === "imports/commit") {
          requireCapability(user, "importLeads");
          if (!Array.isArray(body.rows) || body.rows.length > 5000)
            throw new HttpError(400, "Maximum 5,000 rows per import");
          if (
            body.rows.some(
              (r: unknown) =>
                !r ||
                typeof r !== "object" ||
                [
                  "name",
                  "phone",
                  "email",
                  "address",
                  "city",
                  "state",
                  "zip",
                  "source",
                  "list",
                  "campaign",
                  "market",
                ].some(
                  (k) => typeof (r as Record<string, unknown>)[k] !== "string",
                ),
            )
          )
            throw new HttpError(
              400,
              "Import rows must contain mapped text fields",
            );
          if (route.endsWith("preview"))
            return inspectImport(body.rows as ImportRow[], s);
          if (!s.users.some((u) => u.id === body.assignedTo))
            throw new HttpError(400, "Choose an assignee");
          const counts = commitImport(
            body.rows,
            s,
            body.assignedTo,
            body.reviewed === true,
          );
          audit("CSV import " + JSON.stringify(counts));
          return counts;
        }
        if (route === "scripts") {
          requireCapability(user, "editScripts");
          if (
            !Array.isArray(body.questions) ||
            body.questions.length < 1 ||
            body.questions.length > 30
          )
            throw new HttpError(400, "Use 1–30 questions");
          const old = s.scripts.at(-1)!;
          const questions = body.questions.map(
            (q: { key: string; label: string; prompt: string }) => ({
              key: boundedString(q.key, 100),
              label: boundedString(q.label, 300),
              prompt: boundedString(q.prompt, 2000),
            }),
          );
          s.scripts.push({
            version: old.version + 1,
            title: boundedString(body.title, 200),
            questions,
            createdAt: new Date().toISOString(),
          });
          audit("Published script version " + (old.version + 1));
          return { ok: true };
        }
        if (route === "settings") {
          ownerOnly(user);
          if (
            !Number.isInteger(body.callStart) ||
            !Number.isInteger(body.callEnd) ||
            body.callStart < 0 ||
            body.callEnd > 24 ||
            body.callStart >= body.callEnd
          )
            throw new HttpError(400, "Invalid calling hours");
          s.settings = {
            callStart: body.callStart,
            callEnd: body.callEnd,
            bookingAllowed: !!body.bookingAllowed,
          };
          audit("Updated calling and booking controls");
          return { ok: true };
        }
        if (route === "deals") {
          requireCapability(user, "manageDeals");
          const l = s.leads.find((l) => l.id === body.leadId);
          if (!l) throw new HttpError(404, "Lead not found");
          const d: Deal = {
            id: uid(),
            leadId: l.id,
            stage: "Analyzing",
            asking: 0,
            arv: 0,
            arvSource: "",
            evidenceType: "Unverified",
            subjectSqft: 0,
            subjectBeds: 0,
            subjectBaths: 0,
            comps: [],
            buyerPercent: 70,
            repairs: [],
            contingency: 0,
            targetFee: 10000,
            contractPrice: 0,
            contractDate: "",
            inspectionDate: "",
            closingDate: "",
            earnest: 0,
            titleCompany: "",
            titleIssues: "",
            buyerId: "",
            expectedFee: 0,
            collectedFee: 0,
            jvSplit: 0,
            expenses: 0,
            holding: 0,
            closingCosts: 0,
            buyerProfit: 0,
            offers: [],
          };
          s.deals.push(d);
          audit("Created deal " + d.id);
          return d;
        }
        if (parts[0] === "deals" && parts[1]) {
          requireCapability(user, "manageDeals");
          const d = s.deals.find((d) => d.id === parts[1]);
          if (!d) throw new HttpError(404, "Deal not found");
          if (parts[2] === "offers") {
            const amount = Number(body.amount);
            if (!Number.isFinite(amount) || amount <= 0)
              throw new HttpError(400, "Enter a positive offer");
            d.offers.push({
              id: uid(),
              amount,
              at: new Date().toISOString(),
              status: "Draft · not sent",
            });
            activity(d.leadId, "Offer drafted", "$" + amount + " · not sent");
            return d;
          }
          const numeric = [
            "asking",
            "arv",
            "subjectSqft",
            "subjectBeds",
            "subjectBaths",
            "buyerPercent",
            "contingency",
            "targetFee",
            "contractPrice",
            "earnest",
            "expectedFee",
            "collectedFee",
            "jvSplit",
            "expenses",
            "holding",
            "closingCosts",
            "buyerProfit",
          ];
          const texts = [
            "stage",
            "arvSource",
            "evidenceType",
            "contractDate",
            "inspectionDate",
            "closingDate",
            "titleCompany",
            "titleIssues",
            "buyerId",
          ];
          for (const k of Object.keys(body)) {
            if (numeric.includes(k)) {
              if (
                typeof body[k] !== "number" ||
                !Number.isFinite(body[k]) ||
                body[k] < 0
              )
                throw new HttpError(400, "Invalid amount");
            } else if (texts.includes(k)) boundedString(body[k]);
            else if (k === "repairs") {
              if (
                !Array.isArray(body[k]) ||
                body[k].some(
                  (r: { label: string; amount: number }) =>
                    typeof r.label !== "string" ||
                    !Number.isFinite(r.amount) ||
                    r.amount < 0,
                )
              )
                throw new HttpError(400, "Invalid repairs");
            } else if (k === "comps") {
              if (
                !Array.isArray(body[k]) ||
                body[k].length > 20 ||
                body[k].some(
                  (c: Record<string, unknown>) =>
                    !c ||
                    typeof c.id !== "string" ||
                    c.id.length > 100 ||
                    typeof c.address !== "string" ||
                    c.address.length > 300 ||
                    typeof c.soldDate !== "string" ||
                    c.soldDate.length > 10 ||
                    (c.soldDate !== "" &&
                      (!/^\d{4}-\d{2}-\d{2}$/.test(c.soldDate) ||
                        Number.isNaN(Date.parse(c.soldDate)) ||
                        new Date(c.soldDate).toISOString().slice(0, 10) !==
                          c.soldDate ||
                        c.soldDate > new Date().toISOString().slice(0, 10))) ||
                    ![
                      "soldPrice",
                      "sqft",
                      "beds",
                      "baths",
                      "distanceMiles",
                    ].every(
                      (key) =>
                        typeof c[key] === "number" &&
                        Number.isFinite(c[key]) &&
                        c[key] >= 0,
                    ) ||
                    typeof c.source !== "string" ||
                    c.source.length > 2000 ||
                    !["strong", "typical", "weak"].includes(
                      String(c.similarity),
                    ),
                )
              )
                throw new HttpError(400, "Invalid sold comparable sales");
            } else throw new HttpError(400, "Field not editable");
          }
          if (body.stage && !stages.includes(body.stage))
            throw new HttpError(400, "Invalid stage");
          Object.assign(d, body);
          audit("Updated deal " + d.id);
          return d;
        }
        if (route === "buyers") {
          requireCapability(user, "manageBuyers");
          const b: Buyer = {
            id: uid(),
            name: boundedString(body.name, 200),
            email: body.email ?? "",
            markets: body.markets ?? "",
            zips: body.zips ?? "",
            types: body.types ?? "Single family",
            min: Number(body.min) || 0,
            max: Number(body.max) || 0,
            minBeds: Number(body.minBeds) || 0,
            minSize: Number(body.minSize) || 0,
            rehab: body.rehab ?? "",
            strategy: body.strategy ?? "",
            assignments: !!body.assignments,
            funding: body.funding ?? "Not verified",
            fundingDate: body.fundingDate ?? "",
            recentPurchases: body.recentPurchases ?? "",
            communication: body.communication ?? "Review before contacting",
          };
          s.buyers.push(b);
          audit("Created buyer " + b.id);
          return b;
        }
        if (parts[0] === "buyers" && parts[1] && method === "PATCH") {
          requireCapability(user, "manageBuyers");
          const b = s.buyers.find((b) => b.id === parts[1]);
          if (!b) throw new HttpError(404, "Buyer not found");
          const allowed = [
            "name",
            "email",
            "markets",
            "zips",
            "types",
            "min",
            "max",
            "minBeds",
            "minSize",
            "rehab",
            "strategy",
            "assignments",
            "funding",
            "fundingDate",
            "recentPurchases",
            "communication",
          ];
          if (Object.keys(body).some((k) => !allowed.includes(k)))
            throw new HttpError(400, "Invalid field");
          Object.assign(b, body);
          audit("Updated buyer " + b.id);
          return b;
        }
        throw new HttpError(404, "Not found");
      }),
    );
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    if (e instanceof SyntaxError)
      return json({ error: "Invalid request body" }, 400);
    console.error(
      "Canopy request failed",
      e instanceof Error ? e.name : "unknown",
    );
    return json(
      {
        error:
          "The action could not be saved. Retry; your changes are not confirmed.",
      },
      500,
    );
  }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
