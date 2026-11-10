> **Current Dialerr setup: embedded toolbar only.** Agents sign in inside Dialerr. No Dialerr API tokens/secrets, token minting, webhooks or API synchronization are used. See [toolbar-only setup](TOOLBAR-ONLY.md). This supersedes earlier Dialerr API directions below.

# Integration and acceptance status

Built November 5, 2026. No account changes, real calls, SMS, Google events, purchases, or public deployment were performed.

| Area | Implemented | Remaining verification / limitation |
|---|---|---|
| Demo | Isolated persistent JSON data, owner/caller switch, simulator | Demo roles are deliberately public on loopback. Never use demo for real seller data. |
| Live database | PostgreSQL migration, atomic JSONB aggregate with row lock | Isolated real PostgreSQL migrations, application backup/restore, authentication and concurrency now pass. No deployment database is configured. Single organization only. |
| Authentication | Scrypt password hashes, signed 8-hour HttpOnly sessions, same-origin mutations, login throttling | Configure session secret, HTTPS and database. No self-service reset/MFA/invitation flow. Provision the initial owner server-side; the owner can create and revoke callers under Team. |
| Roles | API rejects unassigned lead reads via state projection and edits; owner-only financials, settings, imports, exports and documents | Provider iframe authorization is a separate boundary. Must verify before enabling live calling. |
| Dialerr embed | Persistent root panel, official script attributes, server-mapped token minting, loadLead/startCall, busy guard, browser lifecycle feedback | No credentials or approved test number supplied. Entitlements, wallet, microphone behavior, expired sessions and exact provider errors remain unverified. |
| Dialerr data | Verified contact mappings, explicit timeline reconciliation, rate limit 4/minute, audit of API usage; no background inactive polling | Reconciliation is manual in Activity. No continuous call polling. Property ambiguity requires owner review. Full provider items preserved privately for review. |
| Webhooks | Raw-body HMAC SHA256, required organization match, stable event deduplication, inbound STOP suppression, ambiguous-property review | Configure provider signing secret and org ID, verify real signed sample. No browser event is represented as a durable provider receipt. |
| SMS | Single-message composer, separate LIVE_MESSAGING_ENABLED gate, DNC checks, retry reservation, queued/accepted/sent/delivered/failed/unknown states, explicit rate-limited delivery checks | No live SMS was sent or verified. Demo creates drafts only. Ambiguous network results never auto-resend. No bulk campaigns; delivery checking is manual. |
| Google Calendar | Scoped OAuth, AES-256-GCM stored tokens, owner calendar allowlist, free/busy, stable-ID event create/update/delete, disconnect | No OAuth credentials supplied; live flow untested. CRM-managed only; direct Google edits do not sync back. Attendees/invitations are not supported. |
| Imports | CSV mapping/preview, validation, contact/property split, normalized phones/email, conservative address matching, duplicate review | Reimports skip existing opportunities rather than overwrite; updated count remains zero. Ambiguous ownership skips. Address matching does not use postal verification or geocoding. Verify imported timezones (default America/Chicago). |
| Daily workflow | Today, leads table/pipeline, queue, script/questionnaire, autosaved answers/notes, outcomes, follow-ups, appointments, timeline | Search indexes current accessible records. Notes/answers and underwriting autosave; creation dialogs use explicit Save. No reminder delivery worker. |
| Underwriting | Manual closed-sale comps calculate weighted $/sq-ft ARV and comp range; separate screening/detailed methods, repair lines, evidence labels, offer drafts, contract/title dates, expected vs collected fees, JV/expenses | No automatic comps feed or preloaded market valuations. Verify sold status and source records; no contract generation/legal compliance claims. Record actual receipts manually. |
| Buyers | Saved criteria, initial market/ZIP + price + assignment matching, reviewable package download | Other criteria are stored and require manual review. Package sending is not exposed. |
| Files | Owner-only private uploads/downloads, MIME/size checks, random storage names | Local disk private storage; back up separately. No malware scanner, object storage or inline photo gallery. |
| Operations | Audit history, owner JSON export, backup/restore guide, loopback preview | Encrypted full backup and nonempty-safe restore commands are tested. No external backup destination, production deployment or recurring service is configured. |

## Exact steps required before live use

1. Provision a PostgreSQL database and restricted application user. Supply DATABASE_URL in the server environment, run the migration, create users, and test backup/restore. Set WORKSPACE_MODE=live explicitly.
2. Generate a SESSION_SECRET (32+ random characters) and TOKEN_ENCRYPTION_KEY (32 random bytes, base64). Store secrets in a local ignored `.env.local` or deployment secret manager. Do not paste them in chat.
3. In Dialerr Settings → API Access, obtain separate publishable embed key, embed secret, and Data API token. Set DIALERR_PUBLISHABLE_KEY, DIALERR_SECRET and DIALERR_API_TOKEN. Restrict the embed key to the exact APP_ORIGIN. Assign each CRM user a verified Dialerr agent email using the server-side user provisioner.
4. Verify the account supports the embed, agent identity minting, Data API scopes and event webhooks. The public API references do not establish this particular account's plan/entitlements. Confirm its wallet/calling/SMS prerequisites without purchasing anything.
5. Verify a caller cannot see other agents' leads, calls, SMS, or owner data inside the embed, and verify provider-side opt-out/calling policies. The CRM cannot secure controls exposed inside a cross-origin provider iframe. Leave DIALERR_ROLE_BOUNDARY_VERIFIED=false if this boundary cannot be demonstrated.
6. Set a webhook URL at `/api/dialerr/webhook` and a secret in Dialerr Integrations → Event Webhooks. Set matching DIALERR_WEBHOOK_SECRET and DIALERR_ORGANIZATION_ID server-side. Test a signed sample and a replay.
7. Obtain explicit owner approval for one exact test number and test action. Only after permission and boundary checks set LIVE_CALLING_ENABLED=true, test the embed, microphone denial, expiry, busy/disconnected agent, insufficient funds and navigation persistence. No approved number was provided in this build.
8. Create a Google OAuth web client with redirect `${APP_ORIGIN}/api/calendar/callback`, configure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET securely, connect as owner, and explicitly select an owned calendar. Verify availability/create/reschedule/cancel/retry without attendees. No calendars are connected here.

## Provider reference evidence

Official documents downloaded November 5, 2026 are in `docs/provider/`:
- https://dialerr.com/llms.txt
- https://dialerr.com/embed/docs
- https://dialerr.com/openapi.json

Documented routes used: POST `/api/v1/embed/token`, GET `/api/v1/leads/{id}/timeline`. Browser: `loadLead`, `startCall`, `call_connected`, `call_ended`, `auth_invalid`. The single-message adapter additionally uses POST `/api/v1/messages` and GET `/api/v1/messages/{id}` only after explicit live enablement and a user action. No AI outbound-call route, provider autodial callback route, account provisioning or plan-change route is invoked.

The public guide says Data API requests consume integration events (1,000 included per month, then $0.01/event), and calling/SMS have separate normal usage charges. Treat these as vendor-published assumptions, not verified account pricing. No API usage or provider charges were incurred during this build.

Google references checked: https://developers.google.com/workspace/calendar/api/v3/reference/events/insert ; https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query ; https://developers.google.com/identity/protocols/oauth2/web-server .
