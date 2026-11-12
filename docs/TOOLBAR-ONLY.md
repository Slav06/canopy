# Dialerr toolbar only — current integration

This supersedes earlier Dialerr API/token setup directions in the setup and integration documents.

Canopy loads the official `https://dialerr.com/embed.js` with `data-surface="dialer"`: Dialerr's full dashboard column, docked full-height on the right of the page. The embed narrows the page to make room, so the panel covers nothing. Agents sign into Dialerr inside the toolbar. There is no CRM-side Dialerr secret, Data API token, agent-token exchange, messaging API, timeline polling or webhook synchronization.

An optional DIALERR_PUBLISHABLE_KEY identifies the embed organization; restrict allowed origins in Dialerr if using one. Official documentation also supports loading the script without a key and signing in inside the widget. Canopy now uses that path by default.

The panel can be closed and reopened using its own launcher. Use Calling to work your CRM queue. Calls and messages are initiated only inside Dialerr: Canopy has no Call button and no API that starts, prepares or loads a call, so CRM Do Not Contact flags and calling-window checks are not applied to dialing. Record qualification, notes and outcomes in Canopy manually. Provider call logs and messages remain in Dialerr and are not automatically copied into Canopy.

The provider iframe has its own permissions: CRM suppression and role filters cannot control numbers entered manually inside Dialerr. Verify Dialerr's account permissions and suppression before team use. This change does not place calls, sign into an account, grant microphone access or change any paid plan.

Google Calendar is a separate optional integration; this change removes only Dialerr API usage. Internal `/api/...` routes continue to store and protect CRM records.
