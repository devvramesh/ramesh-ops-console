# AGENTS.md

Internal tools for a fintech. Every tool here moves money or holds customer identity data. Read this file before any change.

## Security rules
A PR that breaks one of these doesn't merge.

1. Every write goes through `mutate()` in `src/platform/mutate.ts`. It authorizes with `can()`, validates with Zod, runs the app's write, and inserts the audit row in one transaction. Apps write only through the `tx` that `mutate()` passes in. No code outside `src/platform/` calls `db.insert`, `db.update`, `db.delete`, or `db.run`.
2. Every server action, route handler, and page that shows data checks `can()` on the server. If an action has no permission in the app's `policy.ts`, `can()` returns false. Tests call each app's `service.ts` directly, without the UI, so a missing check fails a test. Don't put authorization in `proxy.ts` (formerly `middleware.ts`).
3. `audit_events` is append-only. SQLite triggers abort UPDATE and DELETE. Never add a path that edits or removes audit rows.
4. Audit before and after JSON redacts every field the app's `policy.ts` marks as PII. Never put PII in logs, errors, or audit JSON: no names, emails, account numbers, or document numbers. Log ids.
5. Data that leaves the app (exports, downloads) writes an audit row. Export columns are an explicit list.
6. Approvals go through `decide()` in `src/platform/approvals.ts`. Compare user ids: the requester can't decide their own request, even if they hold the approver role. The decider must hold the required role. A request is decided once: update with `WHERE status = 'pending'` and check that one row changed.
7. A denied attempt writes an audit row with `outcome = 'denied'`.
8. Money is integer cents, USD only. No floats. Timestamps are UTC ISO 8601 strings.
9. All data is synthetic. Never connect to a real service. External systems are stubs behind interfaces in `src/platform/integrations/`.

## Stack
- Next.js 16 (App Router), TypeScript strict, Drizzle ORM on SQLite (better-sqlite3), Zod, Vitest, Tailwind, Fluent UI React v9 (the one component library; components live under `src/components/fluent/`). Node 22 LTS.
- Docs for the installed Next.js version are in `node_modules/next/dist/docs/`. Read the relevant page before using a Next.js API. `cookies()`, `headers()`, `params`, and `searchParams` are async.
- `next.config.ts` sets `agentRules: false` so `next dev` doesn't edit this file.
- better-sqlite3 transactions are synchronous. Inside `db.transaction((tx) => ...)` use `.run()`, `.get()`, `.all()`, never `async` or `await`. Do async work, such as calling an integration stub, before `mutate()`.
- SQLite is for local dev. A Postgres port means moving schema files to `pg-core` and making `mutate()` and `decide()` async. Don't design for it now.
- Don't add a dependency without one line in the PR saying why.
- If better-sqlite3 won't install, run `npm rebuild better-sqlite3` and check the Node version. If it still fails after 10 minutes, report it as blocked. Don't switch database drivers.

## Commands
- `npm install`
- `cp .env.example .env.local`
- `npm run db:reset`: deletes the SQLite file, creates tables with `drizzle-kit push --force`, applies `src/platform/db/triggers.sql`, seeds every registered app
- `npm run dev`: starts the app on port 3000
- `npm test`: runs Vitest against a separate test database
- `npx vitest run tests/<file>.test.ts`: one test file
- `npm run typecheck`

A change isn't done until `npm run typecheck` and `npm test` pass.

## Layout
- `src/platform/`: `auth.ts`, `rbac.ts`, `mutate.ts`, `audit.ts`, `approvals.ts`, `redact.ts`, `db/`. Apps import these and never reimplement them.
- `src/apps/<app>/`:
  - `schema.ts`: its tables
  - `policy.ts`: permissions per action, PII fields, approval rule. Plain data, imports only types.
  - `service.ts`: plain functions that take the user as an argument. Logic lives here.
  - `actions.ts`: `"use server"` wrappers that get the session and call `service.ts`. Export only async functions.
  - `seed.ts`: synthetic records
  - pages under `src/app/<app>/`
- `src/apps/registry.ts`: one entry per app (policy, seed, `onDecision`, `contractWrite`). It's the only file apps share. `tests/contract.test.ts` reads it.
- No migration files. `db:reset` rebuilds from the schema.
- Apps are plain pages. Don't build a generic form or table generator. Shared UI components are fine.

## Roles
Roles are global: `support`, `analyst`, `approver`, `auditor`, `admin`. A user can hold more than one. What each role can do is per app, in that app's `policy.ts`. `admin` gets only what a policy lists; there's no bypass.

## Workflow
- Share your plan before writing code and wait for approval. Managed Devins whose coordinator already has an approved plan skip the wait.
- Work on a branch, open a PR, keep the diff small.
- If a requirement is ambiguous, pick the simplest option and list it under Assumptions. Ask only if you're blocked.
- Before opening the PR, start the app and check the changed pages in the browser.
- In server actions, call `redirect()` outside `try/catch`.

## PRs and docs
- Use the PR template. Keep each section short.
- Open with what changed and why. Don't start with "This PR introduces" or "This PR adds".
- Name files, functions, and tests instead of describing them. Don't claim anything you can't point to.
- Don't narrate the diff file by file.
- No emojis, badges, or marketing words (robust, seamless, comprehensive, powerful, production-ready).
- If something failed or you skipped it, say so in the first section.
