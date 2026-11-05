# Canopy CRM: current operational status

The app at http://127.0.0.1:3210 is still a **local demo workspace**. It has persistent sample records and role previews, not individual live user accounts. Do not treat successful local checks as a completed team rollout.

## Working CRM flows

Lead creation, search, import mapping/validation/deduplication, persistent notes and qualification answers, assigned access, follow-ups, appointment creation/rescheduling/cancellation, drag-and-drop wholesale lead stages, deals/underwriting, buyer records, audit history, Admin-only recoverable deletion, management capability toggles, required Basic Agent call reports with saved drafts, and encrypted export/backup/restore have automated coverage. Database tests use isolated temporary PostgreSQL state and real login sessions.

## Provider boundaries

Dialerr uses only the official floating toolbar, with vendor sign-in. No Dialerr API credentials, token minting, API messages, reconciliation or webhook synchronization are part of this setup. Provider-native permissions must be configured in Dialerr separately. CRM actions do not start the auto-dialer. No real calls or messages were sent in testing. Browser call-event detection still needs a controlled live call test; manual post-call reporting is available.

Google satellite and map embeds are available in each lead. Mapillary setup is deferred at the owner's request. Its tab and network lookup are disabled unless NEXT_PUBLIC_MAPILLARY_ENABLED=true is explicitly set after the workspace token is configured. No billing signup or account creation is required to use the current maps/CRM flows.

Calendar appointments are stored in the CRM; external Google Calendar synchronization is optional and has not been verified with a real account.

## Move from sample data to actual use

Choose local on this Mac or a private hosted team workspace. Live mode requires PostgreSQL, a strong session secret, correct APP_ORIGIN, migration and an individual first Admin account. Real records start empty; sample data is kept separately. Remote callers need an approved private HTTPS destination; a loopback URL works only on this Mac. No hosting service has been provisioned or purchased.

After selecting the destination, follow README's live setup and provision individual agents from Team. Choose and test a separate encrypted backup destination. Verify vendor permissions and a specifically approved call test before team dialing. Keep credentials out of chat and tracked files.
