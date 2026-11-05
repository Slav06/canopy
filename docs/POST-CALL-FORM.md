# Required Basic Agent post-call report

Reference read from the user's Google Form in the browser: **HOT LEADS**, https://docs.google.com/forms/d/1pxns8uMWBP1PG33oXUvuDGrOREShU3DhXWaDW52nwtE/edit . No Google response was submitted and the source form was not changed.

Source questions: seller full name, phone, full address; overall condition (TOTAL REHAB, BIG RENOVATION, LITE RENOVATION, NEW TOTALLY RENOVATED); condition details; motivation; asking price; timeline (ASAP, 3–6 MONTHS, 6+ MONTHS); optional notes; appointment date and time.

Canopy implements these questions as an internal, versioned per-call report. A completed seller conversation requires the qualification fields plus a summary. Asking price may explicitly be Unknown. Appointment date/time/timezone are required only when an appointment was agreed. No-answer, voicemail, wrong-number, not-interested and DNC outcomes require a shorter outcome/summary report rather than invented seller answers.

## Enforcement

- Basic Agents and add-only management users must complete the report before CRM Save & Next or next-call preparation.
- The floating Dialerr's documented browser `call_connected`/`call_ended` events create/end the report when emitted. No Dialerr Data API or token integration is used.
- A persistent **Call ended · complete form** control and **Complete required post-call form** button support manual reporting when the toolbar does not emit a usable event. Recording a Basic Agent outcome also creates a required report.
- The required modal has no close button and cannot be dismissed with Escape. It blocks the surrounding CRM/toolbar while visible.
- Drafts autosave to CRM storage and reappear after reload. Submission validates required fields again on the server. Submitted reports are immutable, idempotent, attributable to an agent and stored in the property's timeline without overwriting existing notes/answers.
- Unassociated toolbar calls require the agent to explicitly choose the correct assigned CRM lead. No property is guessed from a phone number.
- Appointment details are reported for management review; this form does not send invitations or create Google Calendar events.

## Limits

Browser events are UI signals, not durable provider receipts. Calls made outside this CRM tab, missing events, or closing the tab before a report-start request reaches the server cannot be proved from an embedded toolbar alone. Native Dialerr dialing outside the CRM remains under provider controls. No real call was placed to verify event emission. The manual report control remains available as a fallback. Strict vendor-wide enforcement would require Dialerr-native workflow controls; no API integration was added.

Verified: 21 post-call HTTP acceptance checks, required/conditional validation tests, production build, browser rendering of the source questions and conditional appointment fields, and Escape dismissal prevention. Browser QA used demo records only.
