# ramesh-ops-console

## what this is

A feasibility prototype built with Devin to compare code-built internal tools against Power Apps. It holds a shared governed platform and two apps, Refunds and KYC review, on Next.js 16 and SQLite.

## Run it

```
nvm use 22
npm install
cp .env.example .env.local
npm run db:reset
npm run dev
```

Open http://localhost:3000. The header switcher signs in as one of seven seeded users from `src/platform/db/seed.ts`. It works only with `AUTH_MODE=dev` and `NODE_ENV` not set to `production`.

`npm run db:reset` also replaces the placeholder `SESSION_SECRET` from `.env.example` in `.env.local` with a random one; cookies signed with the placeholder would be forgeable by anyone who has this file.

## Layout

- `src/platform/auth.ts`: signed `ops_session` cookie, `getSession()`, roles loaded on every request.
- `src/platform/rbac.ts`: `can(user, app, action)`, `AppPolicy`, missing actions are denied.
- `src/platform/mutate.ts`: authorize, validate with Zod, write, audit, in one transaction.
- `src/platform/audit.ts`: `writeAudit()`, `auditDenied()`, `recordAccess()`, `listAuditEvents()`.
- `src/platform/approvals.ts`: `requestApproval()`, `decide()`; table in `src/platform/approvals/schema.ts`.
- `src/platform/redact.ts`: replaces each `policy.pii` field with `[redacted]`.
- `src/platform/db/`: `schema.ts`, `client.ts`, `triggers.sql`, `reset.ts`, `seed.ts`.
- `src/platform/integrations/payments.ts`: fake payment processor that takes an idempotency key.
- `src/apps/registry.ts`: one entry per app. The only file apps share.
- `src/apps/refunds/`, `src/apps/kyc/`: `schema.ts`, `policy.ts`, `service.ts`, `actions.ts`, `seed.ts`.
- `src/app/refunds/`, `src/app/kyc/`, `src/app/audit/`: pages.
- `src/components/`: `UserSwitcher.tsx`, `AuditTable.tsx`.
- `tests/`: `platform.test.ts`, `contract.test.ts`, `refunds.test.ts`, `kyc.test.ts`, `setup.ts`.

## Mapping to Power Apps

| Power Apps | Here |
| --- | --- |
| Entra ID sign-in | `src/platform/auth.ts`; the OIDC hook is marked in that file |
| Security roles | `permissions` in `src/apps/<app>/policy.ts`, checked by `can()` on the server |
| Dataverse table | `src/apps/<app>/schema.ts` |
| Business rules | Zod schemas and status checks in `src/apps/<app>/service.ts` |
| Audit history | `audit_events`, append-only by `src/platform/db/triggers.sql` |
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
- `tests/contract.test.ts`, for every entry in `src/apps/registry.ts`
  - the policy declares permissions
  - every PII field is a column of the app's table
  - every column matching the PII-name heuristic is declared in `policy.pii`
  - `contractWrite` by a permitted seeded user adds exactly one audit row
  - no seeded PII value appears in audit JSON
  - no `db.insert(`, `db.update(`, `db.delete(`, `db.run(`, `sqlite.exec(`, `sqlite.prepare(`, or `$client.` under `src/apps` or `src/app`
  - every app directory under `src/apps` is registered
  - the fixture app under `tests/fixtures` stays caught by these checks
- `tests/refunds.test.ts`, `tests/kyc.test.ts`: service-level cases for each app.

## How it was built

## What this doesn't do

- No real SSO. The dev switcher stands in; `src/platform/auth.ts` marks where OIDC goes.
- No hosting. It runs on `localhost:3000`.
- No migrations. `npm run db:reset` drops and rebuilds the database.
- The triggers in `src/platform/db/triggers.sql` stop app code, not a person holding the SQLite file.
- No compliance evidence. Nothing here is an audit artifact.
- No idempotency key on create. Submitting `/refunds/new` twice makes two refunds.
- A decision form value that isn't `rejected` decides `approved` (`src/apps/refunds/actions.ts`, `src/apps/kyc/actions.ts`).
- `safeReturnTo` accepts backslash paths like `/\evil.com`, which browsers read as protocol-relative. Dev switcher only.
- `decide()` trusts the `requiredRole` stored on the approval row, not the app's `policy.approval.requiredRole`.
- An approval for an app missing from the registry decides silently: no `onDecision` hook runs.
- `onKycDecision` doesn't check that its case update changed a row (refunds throws on the same condition).
- `refund.auto_approved` audit rows carry a fabricated `pending_approval` before-state that never existed.
- `npm audit` reports ~20 moderate findings, all in dev tooling (eslint/minimatch, drizzle-kit's bundled esbuild). Runtime deps are clean.
- PII masking lives in page components; `service.ts` reads return raw PII, so a new list page that skips `maskEmail`/`maskName`/`maskDocument` would leak it.
- USD only. `currency` must be `"USD"`.
- No connection to real systems. `src/platform/integrations/payments.ts` is a fake.
- No feature-flag panel. Buy a flag service.
- No editing by non-engineers. Every change is a pull request.
- Synthetic data only.
