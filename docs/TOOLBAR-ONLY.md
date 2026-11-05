# Dialerr toolbar only — current integration

This supersedes earlier Dialerr API/token setup directions in the setup and integration documents.

Canopy loads the official `https://dialerr.com/embed.js` in floating toolbar mode outside the CRM container. Agents sign into Dialerr inside the toolbar. There is no CRM-side Dialerr secret, Data API token, agent-token exchange, messaging API, timeline polling or webhook synchronization.

An optional DIALERR_PUBLISHABLE_KEY identifies the embed organization; restrict allowed origins in Dialerr if using one. Official documentation also supports loading the script without a key and signing in inside the widget. Canopy now uses that path by default.

The toolbar floats at the bottom-right and can be minimized using its own controls. Use Calling to work your CRM queue. Calls and messages are initiated inside Dialerr. CRM Call loads the selected seller into the toolbar in a configured live workspace after CRM opt-out/window checks; it does not automatically dial. Demo CRM contacts cannot be loaded for dialing. Record qualification, notes and outcomes in Canopy manually. Provider call logs and messages remain in Dialerr and are not automatically copied into Canopy.

The provider iframe has its own permissions: CRM suppression and role filters cannot control numbers entered manually inside Dialerr. Verify Dialerr's account permissions and suppression before team use. This change does not place calls, sign into an account, grant microphone access or change any paid plan.

Google Calendar is a separate optional integration; this change removes only Dialerr API usage. Internal `/api/...` routes continue to store and protect CRM records.
