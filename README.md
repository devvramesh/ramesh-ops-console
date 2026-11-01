# ramesh-ops-console

## What this is

A feasibility prototype built with Devin Cloud for a build-vs-buy evaluation of Power Apps for a fintech's internal tools. It holds a shared governed platform (`src/platform/`: auth, RBAC, mutations, audit, approvals) with apps built on top of it (`src/apps/`, pages in `src/app/`), on Next.js 16 and SQLite.

## Run it

```
nvm use 22
npm install
cp .env.example .env.local
npm run db:reset
npm run dev
```

Open http://localhost:3000. The "Demo" menu at the bottom of the left navigation signs in as one of seven seeded users from `src/platform/db/seed.ts`. It works only with `AUTH_MODE=dev` and `NODE_ENV` not set to `production`.

`npm run db:reset` also replaces the placeholder `SESSION_SECRET` from `.env.example` in `.env.local` with a random one; cookies signed with the placeholder would be forgeable by anyone who has this file.

## Apps

### Refunds

`src/apps/refunds/` with pages under `src/app/refunds/`. Customer refunds.

- Who can do what (`src/apps/refunds/policy.ts`): support, approver, auditor, and admin can read; support creates; approver approves and rejects; admin marks approved refunds paid; approver and admin export.
- Reason codes: every refund has a `reason_code` from a fixed list in `src/apps/refunds/schema.ts` (`duplicate_charge`, `fraud`, `service_issue`, `goodwill`), required by `createRefundSchema`. The free-text reason is kept as "Details".
- Export: `GET /refunds/export?month=YYYY-MM` (`src/app/refunds/export/route.ts`, "Export CSV" on `/refunds`) returns refunds created in that UTC month for month-end reconciliation. `exportRefundsCsv()` selects only `EXPORT_COLUMNS`: `refund_id`, `created_at`, `updated_at`, `status`, `reason_code`, `amount_cents`, `currency`, `processor_ref`. No customer email, customer ref, free-text details, or requester id.
- Approval rule: a refund over $500.00 is created `pending_approval` and needs an approver who is not the requester; at or under $500.00 it is approved automatically on creation.
- Audited: create, auto-approval, each approval decision, marking paid, every export (one `export` row through `recordAccess()` with the month, row count, and column list), and every denied service call, including denied exports. The list masks customer emails; the audit trail is on each refund's page.

### KYC review

`src/apps/kyc/` with pages under `src/app/kyc/`. Identity verification cases.

- Who can do what (`src/apps/kyc/policy.ts`): analyst, approver, and auditor can read; analysts claim new cases and decide cases assigned to them.
- Approval rule: approving a high-risk case opens an approval that an approver other than the analyst must decide; low and medium risk cases are decided directly.
- Audited: claim, each decision, each approval decision, every denied service call, and every `read_pii` page load. The queue masks names and document numbers; a case page shows them and writes the read audit row.

### Feature flags

`src/apps/flags/` with pages under `src/app/flags/`. Feature flags with a key, description, on/off state, risk (low or high), and owner note.

- Who can do what (`src/apps/flags/policy.ts`): admin, approver, and auditor can read; admin creates flags and turns them on and off. support and analyst have no access.
- Kill switch: admin turns any flag off immediately, with no approval.
- Approval rule: turning a low-risk flag on is immediate; turning a high-risk flag on opens an approval that an approver other than the requester must decide through `decide()`. New flags start off.
- Audited: create, each on and off, each approval decision, and every denied service call. `owner_note` is PII: redacted in audit JSON and left off the list.

## Layout

- `src/platform/auth.ts`: signed `ops_session` cookie, `getSession()`, roles loaded on every request.
- `src/platform/rbac.ts`: `can(user, app, action)`, `AppPolicy`, missing actions are denied.
- `src/platform/mutate.ts`: authorize, validate with Zod, write, audit, in one transaction.
- `src/platform/audit.ts`: `writeAudit()`, `auditDenied()`, `recordAccess()`, `listAuditEvents()`.
- `src/platform/approvals.ts`: `requestApproval()`, `decide()`; table in `src/platform/approvals/schema.ts`.
- `src/platform/redact.ts`: replaces each `policy.pii` field with `[redacted]`.
- `src/platform/db/`: `schema.ts`, `client.ts`, `triggers.sql`, `reset.ts`, `seed.ts`. Triggers make `audit_events` append-only and reject self-decided approvals, any update to a non-pending approval, and any decision written without a `decided_by`.
- `src/platform/stats.ts`: `countRows()` for home-page tile counts.
- `src/platform/integrations/payments.ts`: fake payment processor that takes an idempotency key.
- `src/apps/registry.ts`: one entry per app. The only file apps share.
- `src/apps/refunds/`, `src/apps/kyc/`, `src/apps/flags/`: `schema.ts`, `policy.ts`, `service.ts`, `actions.ts`, `seed.ts`.
- `src/app/refunds/`, `src/app/kyc/`, `src/app/flags/`, `src/app/audit/`: server-component pages that check `can()` and load data on the server.
- `src/components/fluent/`: Fluent UI React v9 presentational components (`NavRail`, `DataTable`, `CommandBar`, `StatusPill`, `SummaryTile`, `HomeTile`, `Notice`, `fields.tsx`, `Provider`).
- `src/components/`: `AuditTable.tsx`, `labels.ts` (`statusLabel`, `formatDateTime`).
- `tests/`: `platform.test.ts`, `contract.test.ts`, `approval-triggers.test.ts`, `refunds.test.ts`, `refunds-export-route.test.ts`, `kyc.test.ts`, `flags.test.ts`, `ui-format.test.ts`, `setup.ts`.
- `.github/CODEOWNERS`: `src/platform/`, `tests/contract.test.ts`, and `AGENTS.md` require `@devvramesh` review.
- `.github/workflows/ci.yml`: `npm run db:reset`, `npm run typecheck`, `npm run lint`, and `npm test` on every pull request.

## Mapping to Power Apps

| Power Apps | Here |
| --- | --- |
| Entra ID sign-in | `src/platform/auth.ts`; the OIDC hook is marked in that file |
| Security roles | `permissions` in `src/apps/<app>/policy.ts`, checked by `can()` on the server |
| Dataverse table | `src/apps/<app>/schema.ts` |
| Business rules | Zod schemas and status checks in `src/apps/<app>/service.ts` |
| Audit history | `audit_events`, append-only by `src/platform/db/triggers.sql` |
| Model-driven shell | left navigation, command bar, status labels, and summary tiles in `src/components/fluent/` (Fluent UI React v9) |
| Approvals flow | `src/platform/approvals.ts`, `onDecision` in `src/apps/registry.ts` |
| Column security | `pii` in `policy.ts`, applied by `src/platform/redact.ts` and list-page masking |
| Connectors | stubs in `src/platform/integrations/` |
| Environments | `.env.local` and `npm run db:reset` |
| Maker portal | a pull request |

## Adding an app

1. Create `src/apps/<app>/` with `schema.ts`, `policy.ts`, `service.ts`, `actions.ts`, `seed.ts`.
2. Add pages under `src/app/<app>/`.
3. Add one entry to `src/apps/registry.ts`: `policy`, `table`, `seed`, `onDecision`, `contractWrite`.
4. Write `tests/<app>.test.ts` against `service.ts`.
5. Run `npm run db:reset`, `npm run typecheck`, `npm test`.

`tests/contract.test.ts` fails if the entry lacks permissions or PII fields, or if a column that looks like PII isn't declared in `policy.pii`. It also fails on direct `db`/`sqlite` writes under `src/apps` or `src/app`, and on an app directory missing from the registry. `.agents/skills/new-internal-app/SKILL.md` lists the same steps. `src/apps/kyc/` was built from it.

## Tests

`npm test` runs Vitest against `data/test.sqlite`, rebuilt by `tests/setup.ts`.

- `tests/platform.test.ts`
  - a missing policy action is denied
  - an unauthorized role is denied and the denial is audited
  - `mutate()` writes exactly one audit row
  - `UPDATE` and `DELETE` on `audit_events` fail
  - the requester cannot decide their own approval
  - deciding an approval twice fails and the denied retries are audited
  - `db:reset` works with no `data/` directory and rewrites a placeholder `SESSION_SECRET`
- `tests/approval-triggers.test.ts`
  - an UPDATE that sets `decided_by` to the requester fails, even inside a raw transaction
  - any UPDATE to a non-pending approval fails, even inside a raw transaction
  - an UPDATE that sets a decided status with no `decided_by` fails, even inside a raw transaction
- `tests/ui-format.test.ts`
  - `statusLabel` renders readable labels such as "Pending approval"
  - `formatDateTime` renders "Oct 18, 2026, 6:25 PM UTC"
  - `countRows` returns seeded counts for every registered app
- `tests/contract.test.ts`, for every entry in `src/apps/registry.ts`
  - the policy declares permissions
  - every PII field is a column of the app's table
  - every column matching the PII-name heuristic is declared in `policy.pii`
  - `contractWrite` by a permitted seeded user adds exactly one audit row
  - no seeded PII value appears in audit JSON
  - no `db.insert(`, `db.update(`, `db.delete(`, `db.run(`, `db.transaction(`, `sqlite.exec(`, `sqlite.prepare(`, `$client.`, or imports of `better-sqlite3` under `src/apps` or `src/app`
  - every app directory under `src/apps` is registered
  - the fixture app under `tests/fixtures` stays caught by these checks
- `tests/refunds.test.ts`, `tests/kyc.test.ts`, `tests/flags.test.ts`: service-level cases for each app, including refund reason-code validation and `exportRefundsCsv` columns, month filter, audit rows, and denials.
- `tests/refunds-export-route.test.ts`: CSV headers, 403 for support, and 400 for a malformed month on `/refunds/export`.
- `tests/actions.test.ts`, `tests/auth-actions.test.ts`: decision input validation and same-origin return paths.
- `tests/kyc-page.test.ts`: one PII-free `read_pii` audit row per KYC detail load.

## Security notes

- `src/platform/db/triggers.sql` makes `audit_events` append-only and rejects, at the database layer, any approval decided by its requester, any update to a non-pending approval, and any decision written without a `decided_by`.
- `.github/CODEOWNERS` assigns `src/platform/`, `tests/contract.test.ts`, and `AGENTS.md` to `@devvramesh`.
- `.github/workflows/ci.yml` runs `npm run db:reset`, `npm run typecheck`, `npm run lint`, and `npm test` on every pull request.

## How it was built

### The two-hour build

Built with Devin Cloud. `AGENTS.md`, the PR template, and the `new-internal-app` skill were written before any session ran, and every PR was reviewed before merging.

| PR | What it did | Opened (UTC) | Merged (UTC) |
| --- | --- | --- | --- |
| #1 | Foundation: Next.js 16 scaffold, auth, rbac, mutate, audit, approvals | Oct 31, 2026, 8:12 PM | Oct 31, 2026, 8:46 PM |
| #2 | Refunds app with threshold approvals, payments stub, and audit trail, built in parallel with #3 | Oct 31, 2026, 8:27 PM | Oct 31, 2026, 8:40 PM |
| #3 | KYC review queue app, built in parallel with #2 by a second Devin session | Oct 31, 2026, 8:29 PM | Oct 31, 2026, 8:45 PM |
| #4 | README: run, layout, Power Apps mapping, adding an app, tests, limits | Oct 31, 2026, 8:35 PM | Oct 31, 2026, 8:46 PM |
| #5 | Hardening pass where Devin audited its own work: audit fixes and restoring missing KYC/docs on master | Oct 31, 2026, 9:30 PM | Oct 31, 2026, 9:38 PM |
| #6 | Follow-up fixes from review: approval validation, KYC read auditing, remaining hardening findings | Oct 31, 2026, 9:54 PM | Oct 31, 2026, 9:54 PM |

First commit to last merge took 2 hours 12 minutes.

### Follow-up work before the demo

After the two-hour build I added these to prepare the client demo, outside the two-hour budget. Later apps add their own rows.

| PR | What it did | Opened (UTC) | Merged (UTC) |
| --- | --- | --- | --- |
| #7 | Database safeguards on approvals, CODEOWNERS, CI, and the Fluent UI restyle | Nov 1, 2026, 9:07 PM | Nov 1, 2026, 9:13 PM |
| TBD | Feature-flags app | - | - |
| TBD | Finance change request | - | - |

## Next steps

Planned but not built:

- Lint rules that check code structure instead of text matching for raw database writes
- Contract-test checks for denied reads and self-approval on every app
- Auditing refund email views
- Auditing page-level permission denials
- Requiring a note on every approval
- Session expiry

## What this doesn't do

- No real SSO. The demo switcher stands in; `src/platform/auth.ts` marks where OIDC goes.
- No hosting. It runs on `localhost:3000`.
- No migrations. `npm run db:reset` drops and rebuilds the database.
- The triggers in `src/platform/db/triggers.sql` stop app code, not a person holding the SQLite file.
- No compliance evidence. Nothing here is an audit artifact.
- No idempotency key on create. Submitting `/refunds/new` twice makes two refunds.
- Decision notes are free text and are not redacted.
- `npm audit` reports ~20 moderate findings, all in dev tooling (eslint/minimatch, drizzle-kit's bundled esbuild). Runtime deps are clean.
- PII masking lives in page components; `service.ts` reads return raw PII, so a new list page that skips `maskEmail`/`maskName`/`maskDocument` would leak it.
- USD only. `currency` must be `"USD"`.
- No connection to real systems. `src/platform/integrations/payments.ts` is a fake.
- No editing by non-engineers. Every change is a pull request.
- Synthetic data only.
