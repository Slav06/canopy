> **Current Dialerr setup: embedded toolbar only.** Agents sign in inside Dialerr. No Dialerr API tokens/secrets, token minting, webhooks or API synchronization are used. See [toolbar-only setup](docs/TOOLBAR-ONLY.md). This supersedes earlier Dialerr API directions below.

# Canopy Real Estate CRM

A local Next.js / TypeScript / Tailwind application for an owner and a small calling team. This directory is isolated from the existing Income Engine; no Track A, Track B, CRM state, or monitors were changed.

## Run the demo

Node 22+ required. Dependencies are locked in package-lock.json.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:3210. Development defaults to demo mode when WORKSPACE_MODE is absent. In production, demo must be explicitly selected; otherwise live authentication/database is required. For a production-mode local demo:

```sh
npm run build
WORKSPACE_MODE=demo npm start
```

The demo uses `.data/demo.json` with fictional seller/property records and reserved 555 phone numbers. CRM sample records are isolated from live data. The separately embedded Dialerr toolbar and Google map embeds contact their providers; Dialerr can access a live account after sign-in. No real dialing should be inferred from demo CRM outcomes. The role switch is for demonstration, not live authentication. Do not put real seller information in demo mode or expose it beyond loopback.

## What you can do

- Work overdue follow-ups, qualification reviews, appointments, offers and closing dates from Today.
- Search sellers/phone/email/property; use a table or pipeline; assign callers.
- Import CSV through mapping, validation and duplicate review. Reimports keep corrected fields. Multiple properties sharing an owner stay separate.
- Use a versioned owner-editable seller script or compact questionnaire; autosave answers/notes; record outcomes; schedule reminders or appointments.
- Keep call reports, notes and CRM activity with each property. Messaging and calling use the signed-in Dialerr toolbar; there is no Dialerr API synchronization.
- Keep the official floating Dialerr toolbar mounted across internal navigation. Agents sign in inside it; CRM role restrictions and vendor account permissions are separate.
- Underwrite with separate screening and detailed-cost calculators; record offers, contract dates, repair lines, title issues, expected/collected fees, JV splits and expenses.
- Save buyer criteria and funding evidence, review initial matches and download a deal package draft.
- Store private documents/photos, export owner records, inspect audit history and configure calling windows.

Creation dialogs use explicit Save; notes, qualification answers and underwriting fields autosave with visible status. Imports use conservative textual address normalization rather than a paid address-verification service. Imported properties default to America/Chicago and need timezone verification. Buyer matching is initially market/ZIP, purchase price and assignment acceptance; additional preferences remain visible for manual review.

## Live setup

Copy `.env.example` to ignored `.env.local` and populate it locally or use a secret manager. Never send secrets through chat or commit them. `.env.local` is loaded by Next; CLI commands below use Node's env-file support.

1. Set WORKSPACE_MODE=live, DATABASE_URL, APP_ORIGIN (exact scheme/host/port), SESSION_SECRET.
2. Run the PostgreSQL migration:

```sh
node --env-file=.env.local --import tsx db/migrate.ts
```

3. Provision users via `db/create-user.ts`. Set NEW_USER_EMAIL, NEW_USER_NAME, NEW_USER_ROLE (owner/caller), NEW_USER_PASSWORD (14+ characters) and optionally NEW_USER_DIALERR_EMAIL in the provisioner's process environment using a local secure method. Do not put passwords in shell history/arguments. Then:

```sh
node --env-file=.env.local --import tsx db/create-user.ts
```

Remove temporary NEW_USER_* values from the environment after provisioning. There is no public signup. Never use a default/shared password. The live database starts empty; demo records are not copied.

4. Build and start behind HTTPS on a private server when deployment is separately approved. The application binds loopback. Do not expose PostgreSQL to the browser or give callers database credentials.
5. Complete [the integration checklist](docs/INTEGRATION-STATUS.md) before turning on any live provider capability. The provider's own embedded UI access boundary remains unverified.

Persistence uses one PostgreSQL JSONB aggregate with separately identified users, contacts, properties, opportunities and activity collections. `SELECT FOR UPDATE` serializes updates and retries deduplicate provider IDs. This is a deliberately simple single-organization application, not a multi-tenant platform. Demo persistence serializes in-process file writes and uses atomic rename; use PostgreSQL for live work or multiple processes.

## Validation

```sh
npm test
npm run typecheck
npm run build
# With the demo server running; uses and restores demo state:
python3 tests/http-check.py
```

See [test results and verification limits](docs/TEST-RESULTS.md). Production build uses the supported webpack option because this host's sandbox blocks a Turbopack helper from binding a local socket.

## Backups and restore

Back up both PostgreSQL and private `.data/documents/` together. Keep encrypted, access-controlled copies off the application machine using your approved backup destination. The UI JSON export is a review/data portability export and omits authentication secrets/provider mappings; it is not a full system backup.

For full live backups, use `pg_dump` with a secure PostgreSQL service/password file, avoiding credentials in command arguments or history:

```sh
pg_dump --format=custom --file=canopy-backup.dump --dbname=service=canopy
```

Copy `.data/documents/` and separately back up the server secret configuration through your secret manager. File names are stored in database document metadata. Calendar tokens in PostgreSQL require the same TOKEN_ENCRYPTION_KEY to decrypt after restore.

Restore into a NEW empty private database first:

```sh
pg_restore --dbname=service=canopy_restore --no-owner canopy-backup.dump
```

Restore the matching document directory and encryption/session configuration, run the application privately against the restored database, sign in, inspect counts, test an uploaded file and a lead note, and compare recorded collected-fee totals. Only switch the live DATABASE_URL after this verification and owner-authorized maintenance. Keep the prior database for rollback. Do not run destructive restore flags against a running database. No backup destination or schedule was configured by this build.

For demo backups, stop the demo process and copy `.data/demo.json` and `.data/documents/`. Restore to a separate demo copy before replacing anything. Demo state can be regenerated by moving its file aside, but preserve user edits first.

## Costs and boundaries

Local demo has no provider usage fees and no paid dependencies. Existing local compute/storage is assumed available. Production requires a PostgreSQL host, application host, private file capacity, backups and TLS; no services were purchased, so actual hosting costs are unknown. Dialerr wallet usage/phone-number/account charges and Google account quotas must be verified on the actual accounts. The Dialerr guide lists 1,000 included integration events/month then $0.01/event; this app audits explicit reconciliation requests and does not poll inactive records. A single reconciliation uses one Data API request; verifying a mapping also uses one request.

No real calls, messages, invitations, commercial submissions, purchases, account changes or public deployments were made. No fictional comps are supplied and no generated contract is claimed to be legally compliant. Controls are compliance support, not legal guarantees. Automatic delivery polling, inbound Google synchronization, automated reminders, MFA/password reset and production operations are outside this implementation; see the exact status checklist.

## Operational verification and launch gate

The latest audit adds an owner-only Launch readiness panel under Integrations and Team, live caller creation/revocation, completion of next actions, appointment/follow-up consistency fixes, stricter import/contact validation, and serialized note/underwriting saves. The preview remains demo; no real workspace has been enabled.

Run `npm run doctor` for a secret-free configuration report. Exit code 2 means team launch prerequisites are incomplete. When using `.env.local`, run `node --env-file=.env.local --import tsx db/doctor.ts` so the CLI receives that file. A passing configuration check is not a substitute for provider or deployment acceptance.

`npm run test:postgres` runs an isolated temporary real PostgreSQL cluster and a production HTTP server. It tests actual owner/caller login, revocation, scoped records, concurrent updates, private documents and encrypted backup/restore. It cleans up its own database, server and fixture files. It never uses your DATABASE_URL or contacts Dialerr/Google. The embedded database dependency is development-only; do not use it as your production service.

### Encrypted full backup and safe restore

In addition to the PostgreSQL-native backup instructions above, the app now includes a tested encrypted backup format that bundles the workspace (including hashed login credentials), encrypted calendar connections, and referenced private files. Set BACKUP_PASSPHRASE securely in the process environment (20+ characters; use a password manager). Never put it in shell arguments/history. Then:

```sh
node --env-file=.env.local --import tsx db/backup.ts /approved/private/path/canopy-backup.enc
```

The destination must be a new file; backups are mode 0600 and authenticated/encrypted. Store the passphrase and TOKEN_ENCRYPTION_KEY separately from the backup. The app does not upload backups or configure an off-machine destination.

To restore, point DATABASE_URL at a NEW database, migrate it, and run the restore command from the matching app checkout with its private document storage:

```sh
node --env-file=.env.restore.local --import tsx db/migrate.ts
node --env-file=.env.restore.local --import tsx db/restore.ts /approved/private/path/canopy-backup.enc
```

The restore command refuses nonempty workspaces/calendar connection stores and refuses to overwrite differing private files. Verify account access, counts and files before switching live traffic. Source TOKEN_ENCRYPTION_KEY is still required for restored Google tokens. Treat backups as highly sensitive even though encrypted.

## Admin / Basic Agent / Upper Management

See [role definitions, controls and provider boundaries](docs/ROLES.md). Admin configures agent modes and individual management on/off switches under Team. Basic Agent records are add-only. Only Admin can delete or restore CRM leads; deletion is recoverable. Existing Owner and Caller accounts retain their identifiers and become Admin and Basic Agent respectively. The independent Dialerr account must have matching provider-side restrictions.

Required Basic Agent call reports: [workflow and toolbar limitations](docs/POST-CALL-FORM.md).
