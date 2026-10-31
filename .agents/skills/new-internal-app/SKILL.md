---
name: new-internal-app
description: Use when asked to add a new internal tool, review queue, admin page, or approval workflow to this repo. Takes a short spec and builds the app on the shared platform, with its policy, service, server actions, pages, seed data, and tests.
argument-hint: <spec>
---

## Input
A short spec: the entity and its fields, which fields are PII, the roles and what each can do, the workflow states, and any approval rule (threshold and approver role).

If the spec doesn't say whether a field is PII, treat names, emails, phone numbers, addresses, government ids, and account numbers as PII. If it doesn't say who can do an action, nobody can. List both under Assumptions.

Example:

    Vendor payouts. Fields: vendor_ref, vendor_name, bank_account (PII), amount_cents, status (draft, pending_approval, approved, paid).
    support creates drafts and submits them. Payouts over 1000000 cents need an approver. admin marks approved payouts paid. auditor reads.

## Steps
1. Read AGENTS.md. Share your plan before writing code, unless you're a managed Devin whose coordinator's plan is already approved.
2. Read `src/platform/` and one existing app in `src/apps/` as the pattern.
3. Create `src/apps/<app>/schema.ts`. Don't edit other apps' files.
4. Create `src/apps/<app>/policy.ts`: permissions per action, PII fields, and the approval rule if there is one.
5. Create `src/apps/<app>/service.ts`. Every write calls `mutate()`. Approval requests are created inside a `mutate()` write and decided through `decide()`. Every function checks `can()`.
6. Create `src/apps/<app>/actions.ts`: `"use server"` wrappers that get the session and call `service.ts`.
7. Create `src/apps/<app>/seed.ts` with about 10 synthetic records.
8. Add one entry to `src/apps/registry.ts`: policy, seed, `onDecision` if the app has approvals, and `contractWrite`.
9. Create pages under `src/app/<app>/`: a list page with PII masked, and a detail page showing only the actions the current user can take, plus the record's audit trail.
10. Add `tests/<app>.test.ts`, calling `service.ts` with seeded users:
    - a role without permission is denied and the denial is audited
    - every write produces one audit row with PII redacted
    - with an approval rule: self-approval is rejected even when the requester holds the approver role, the wrong role is rejected, the threshold boundary is right, deciding twice fails
11. Run `npm run db:reset`, `npm run typecheck`, and `npm test`. `tests/contract.test.ts` must pass for the new app.
12. Start the app and walk the main flow in the browser as two different users. Send the recording in the session. Open the PR only after the walkthrough passes.

## Done
- Typecheck and all tests pass, including the contract test.
- The app shows on the home page for roles that can read it.
- The PR lists the spec, the files added, and the assumptions.

## Never
- Write to the database outside `mutate()` or `decide()`.
- Edit another app's folder or anything in `src/platform/`. If the platform is missing something, say so in the PR.
- Put PII in logs, errors, or audit JSON.
