# Verification — November 5, 2026

## Passed

- `npm test`: **10/10** deterministic core checks passed.
- `npm run typecheck`: passed with strict TypeScript.
- `npm run build`: passed with Next.js webpack production build. Routes `/`, `/_not-found` and dynamic `/api/[...path]` generated successfully.
- `python3 tests/http-check.py`: **17/17** real loopback HTTP checks passed. This script restores the original demo fixture after testing.

Core tests cover role-projected data, password hashes and session tamper rejection, duplicate imports preserving corrections, duplicate rows within a file, row validation errors, one seller/multiple properties, opt-out and local-window enforcement, exact-body webhook HMAC, webhook retry deduplication, ambiguous property review, inbound STOP, and separate underwriting methods/actual receipts.

HTTP tests cover direct caller export and financial-write denial, unassigned lead mutation denial, assignment restrictions, persistent note saves, independent property notes, DNC calling and messaging blocks, appointment retry idempotence, invalid date rejection, demo drafts with no transmission, message retry idempotence, cross-property message ID collisions, and cross-origin mutation rejection.

Browser checks on the local demo:

- Today rendered in narrow/mobile and desktop layouts with distinct demo labeling.
- Calling screen opened the assigned seller, script, qualification fields and notes.
- Property note was edited in the browser, autosaved and confirmed persisted in the file after reload. The HTTP test independently verifies the same persistence path.
- Explicit Call started a labeled simulator. Navigating to Today retained the same simulated active call in the persistent session panel. Simulation was ended deliberately; no phone connection was made.
- Deals rendered asking price, evidence classification, ARV source, repairs, separate method tabs, screening MAO ($136,500 for the demo inputs), actual vs expected fees and matching buyer reasons. Unit coverage also checks sold-comp weighting, price-per-square-foot ARV, comp range and missing subject-area behavior.
- Final Today screenshot is `docs/preview-desktop.jpg`.

The development server restarted when next.config changed; one existing browser tab stopped reconnecting even though loopback HTTP still returned 200. A fresh preview tab loaded successfully. Initial Turbopack production compilation was blocked by a sandbox helper socket restriction; the webpack build passed. No security settings or provider permissions were weakened to resolve these tool limits.

## Not verified live

PostgreSQL migration/restore/concurrency, authenticated live-owner/caller sessions against PostgreSQL, Dialerr account entitlements/agent isolation, embed microphone/expiry/busy/funds errors, live call navigation survival, actual signed provider delivery, live SMS acceptance/delivery, and Google OAuth/calendar create/update/delete/retry require configured accounts and credentials. These are not claimed to pass.

The 17 HTTP checks run in isolated demo mode, so they exercise the same application permission handlers but do not prove PostgreSQL deployment or provider-side permissions. The simulator navigation test does not prove a real WebRTC call survives navigation. No intentionally failed autosave was induced in browser QA; API validation errors and visible save-failure/retry code exist, but that browser acceptance check remains manual.

## Reproduce

```sh
npm ci
npm test
npm run typecheck
npm run build
npm run dev
# In a separate terminal, while demo is running:
python3 tests/http-check.py
```

No real calls, messages, calendar events, commercial actions, purchases, account changes or public deployments were performed.

## Operational audit follow-up

13 core tests and 26 demo HTTP checks now pass. Additionally, `npm run test:postgres` passed 26 checks against an isolated real PostgreSQL cluster and a production HTTP server; exact results are in `postgres-test-results.json`. This supersedes the earlier limitation about migrations, live authentication, concurrency, private files and application backup/restore being untested. The deployment database is still not configured, and provider/account/remote-host acceptance remains unverified.

Fixed import validation bypass after normalization, orphan contacts on ambiguous ownership, duplicate manual property entry, stale appointment next-action dates, same-day overdue detection, and overlapping saves. Added caller creation/revocation and the launch-readiness panel. Browser automation was unavailable in this audit (`browser.user` unavailable), so these latest UI controls were build-checked and their handlers exercised over HTTP; no new browser acceptance claim is made.
