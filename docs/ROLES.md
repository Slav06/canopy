# Admin and agent modes

## Admin

Existing Owner accounts are Admin accounts. Admin has full CRM access, assigns roles, enables management capabilities, revokes logins, configures integrations/settings, and can delete or restore leads. The last/admin accounts cannot be downgraded or revoked through the agent controls.

## Basic Agent

Existing Caller accounts become Basic Agents. They see assigned active leads, can use Dialerr calling subject to its own permissions, append new notes, fill unanswered qualification fields and add call-outcome history. Existing notes, captured answers, seller/property details, status, ownership and assignment cannot be overwritten. A note is added using **Add note**, not by replacing the existing note. Qualification answers use **Add qualification answers**; saved answers become read-only.

Basic agents cannot delete/restore leads, edit captured data, complete existing tasks, import/export, access financials, publish scripts, schedule/update appointments, change team permissions or change workspace settings. They may add a Do Not Contact suppression for safety; only Admin may remove it. Recording a call outcome does not change the lead's existing status for Basic Agents.

## Upper Management

Management begins with Basic Agent access. Under **Team → Agent modes & permissions**, Admin can individually enable:

- View all team leads (otherwise assigned leads only)
- Edit existing lead, contact and property information
- Assign leads to agents
- Create new leads
- Import CSV lists
- View/manage deals and financials
- View/manage buyers
- View reports (includes report financial records)
- Export accessible CRM records
- Book/update appointments and follow-ups
- Publish script templates

There is no delete permission toggle. Management can never delete or restore CRM leads, change its own permissions, create/revoke accounts or configure workspace credentials/settings. Switching back to Basic Agent clears management capabilities. Changes apply to the next request, including existing logged-in sessions.

## Lead deletion and recovery

Admin's lead detail contains **Delete lead**, with confirmation. This is recoverable deletion: the lead disappears from active lists and calling queues, while its history is preserved. Admin restores it under **Team → Deleted leads · Admin recovery**. Linked deal/financial history remains available through preserved archived lead references. There is no public permanent-delete endpoint.

## Demo and live operation

The demo workspace menu offers **Admin mode**, **Basic Agent mode**, and **Upper Management mode**. Demo role switching is for demonstration only; it is unavailable in live mode. Live access is derived from the authenticated user's stored server-side role and capability map. Client-supplied roles are not trusted. Admin creates actual agent accounts under Team once a live workspace exists.

Stored identifiers retain backwards compatibility: `owner` = Admin, `caller` = Basic Agent, `manager` = Upper Management. No existing contacts or research were migrated or removed.

## Dialerr boundary

These permissions govern Canopy CRM. The floating Dialerr toolbar is a separate provider session and uses the account signed in inside it. Canopy cannot remove vendor-side lead deletion or admin controls from that cross-origin account. Configure individual Dialerr agent permissions separately; never share the Dialerr administrator login with agents. The toolbar role boundary has not been verified for agent accounts.

## Verification

`python3 tests/roles-check.py` verifies 33 direct HTTP checks covering additive information, overwrite prevention, role escalation denial, on/off capabilities, admin-only recoverable deletion, and restoration. It uses loopback demo data and restores the fixture. Core tests and the production build pass. Authenticated PostgreSQL acceptance is separately recorded in `postgres-test-results.json`.
