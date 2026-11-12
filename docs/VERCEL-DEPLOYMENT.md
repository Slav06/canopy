# Vercel setup for Canopy

The existing site is `https://canopy-sepia-delta.vercel.app/`. Production uses Neon PostgreSQL; Vercel's function filesystem is temporary, so private document uploads must stay disabled. The repository build runs the idempotent database migration during production builds. It skips database access for Preview builds.

## Plan and business-use restriction

Vercel Hobby is free but limited to personal, noncommercial use. Canopy agents handling business leads is commercial use. Keep this deployment on Vercel only if its project is on a plan that permits this use; otherwise use a host whose terms permit business use. Do not upgrade or add billing without the owner's explicit approval.

## Production environment variables

Add these under the project's **Production** environment only. Enter secret values directly in Vercel; never add them to GitHub or chat.

| Name | Value |
| --- | --- |
| `WORKSPACE_MODE` | Optional in Production; the build defaults it to `live`. If set explicitly, use `live`. |
| `DATABASE_URL` | Neon PostgreSQL **pooled** connection string for `canopy-crm-test` |
| `APP_ORIGIN` | `https://canopy-sepia-delta.vercel.app` |
| `SESSION_SECRET` | Random secret of at least 32 characters |
| `PRIVATE_UPLOADS_ENABLED` | `false` |

The build requires the production values above and creates an empty live workspace. There are no login emails or passwords.

## Access by private link

The first person to open a new live workspace enters their name and becomes Admin. They are shown a private link (`https://…/?key=…`) once; bookmarking it is how they get back in. Open the site and claim Admin immediately after the first deploy, because until then anyone who finds the address can claim it.

Admin creates each agent under **Team** by name and sends them their own private link. Admin can replace an agent's link (the old one stops working at once) or revoke the account; anyone signed in can replace their own link from the workspace menu. Only a hash of each link is stored, so a lost link is replaced, not recovered. If every Admin link is lost, run `npm run user:create` with `NEW_USER_NAME` and `NEW_USER_ROLE=admin` against the production database to print a new one.

## Preview environment

Set `WORKSPACE_MODE=demo` for Preview deployments. Keep the production database credentials scoped to Production; previews should not touch real records. The preview role switch and sample data are for testing only.

## First launch

1. Confirm the Vercel plan permits Canopy's business use and that this project is connected to `Slav06/canopy` with the repository root as its root directory.
2. Confirm the Neon project is on its Free plan and copy its pooled connection string directly into Vercel's secret `DATABASE_URL` field. The database starts empty; this does not import local demo records.
3. Add the Production variables above.
4. Deploy the current `main` commit. Check `/api/health` returns `{"status":"setup"}`, open the site, claim Admin and save the private link (health then returns `{"status":"ok"}`), then create a private link for each agent under Team.
5. Confirm the live banner, empty lead list, lead creation, assignment, a basic-agent private link and admin-only delete control. Keep live Dialerr calling disabled until Dialerr account permissions and suppression controls have been verified separately.

Hobby usage and function quotas apply if allowed by the account's plan. Neon Free can suspend or limit the database when its free allowance is reached. Keep test records only and export regularly until an approved backup plan exists. Uploads, automatic Dialerr synchronization, Mapillary and Google Calendar are not enabled by this setup.
