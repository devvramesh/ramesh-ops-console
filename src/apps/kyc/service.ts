import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { approvals, decide, getApproval, listApprovals, requestApproval, type Approval, type Decision } from "@/platform/approvals";
import { AccessDeniedError, auditDenied, listAuditEvents } from "@/platform/audit";
import { db, type Tx } from "@/platform/db/client";
import { mutate } from "@/platform/mutate";
import { can, type SessionUser } from "@/platform/rbac";
import { kycPolicy } from "./policy";
import { kycCases, type KycCase } from "./schema";

const APP = kycPolicy.app;

export class KycError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KycError";
  }
}

const noteSchema = z.string().trim().min(1, "a decision note is required");
const idSchema = z.string().min(1);

function deny(user: SessionUser | null | undefined, action: string, entityId: string | null = null): never {
  auditDenied(user, APP, action, entityId);
  throw new AccessDeniedError(`${user?.id ?? "anonymous"} may not ${APP}.${action}`);
}

function requireRead(user: SessionUser | null | undefined, entityId: string | null = null): SessionUser {
  if (!user || !can(user, APP, "read")) deny(user, "read", entityId);
  return user;
}

function loadCase(tx: Tx, id: string) {
  return tx.select().from(kycCases).where(eq(kycCases.id, id)).get();
}

function pendingApprovalFor(tx: Tx, id: string) {
  return tx
    .select()
    .from(approvals)
    .where(and(eq(approvals.app, APP), eq(approvals.entityId, id), eq(approvals.status, "pending")))
    .get();
}

export function listCases(user: SessionUser | null | undefined, filter: { status?: string } = {}): KycCase[] {
  requireRead(user);
  return db
    .select()
    .from(kycCases)
    .where(filter.status ? eq(kycCases.status, filter.status) : undefined)
    .orderBy(asc(kycCases.createdAt))
    .all();
}

export function getCase(user: SessionUser | null | undefined, id: string): KycCase | undefined {
  requireRead(user, id);
  return db.select().from(kycCases).where(eq(kycCases.id, id)).get();
}

export function caseApprovals(user: SessionUser | null | undefined, id: string): Approval[] {
  requireRead(user, id);
  return listApprovals({ app: APP, entityId: id });
}

export function caseAudit(user: SessionUser | null | undefined, id: string) {
  requireRead(user, id);
  return listAuditEvents({ app: APP, entityId: id });
}

/** A `new` case becomes `in_review` and is assigned to the caller. */
export function claimCase(user: SessionUser | null | undefined, id: string): KycCase {
  return mutate(user, {
    app: APP,
    action: "claim",
    schema: z.object({ id: idSchema }),
    input: { id },
    load: (tx) => loadCase(tx, id),
    write: (tx, data) => {
      const row = loadCase(tx, data.id);
      if (!row) throw new KycError(`case ${data.id} not found`);
      if (row.status !== "new") throw new KycError(`case ${data.id} is ${row.status}, not new`);
      return tx
        .update(kycCases)
        .set({ status: "in_review", assignee: user!.id, updatedAt: new Date().toISOString() })
        .where(and(eq(kycCases.id, data.id), eq(kycCases.status, "new")))
        .returning()
        .get()!;
    },
  });
}

/**
 * The assigned analyst approves or rejects an `in_review` case with a note.
 * Approving a high-risk case leaves it `in_review` and opens an approval for an approver;
 * `onKycDecision` moves it to `approved` when that approval is granted.
 */
export function decideCase(user: SessionUser | null | undefined, id: string, decision: Decision, note: string): KycCase {
  const action = decision === "approved" ? "approve" : "reject";
  if (user && can(user, APP, action)) {
    const current = db.select({ assignee: kycCases.assignee }).from(kycCases).where(eq(kycCases.id, id)).get();
    if (current && current.assignee !== user.id) deny(user, action, id);
  }
  return mutate(user, {
    app: APP,
    action,
    schema: z.object({ id: idSchema, note: noteSchema }),
    input: { id, note },
    load: (tx) => loadCase(tx, id),
    write: (tx, data) => {
      const row = loadCase(tx, data.id);
      if (!row) throw new KycError(`case ${data.id} not found`);
      if (row.status !== "in_review") throw new KycError(`case ${data.id} is ${row.status}, not in_review`);
      if (row.assignee !== user!.id) throw new KycError(`case ${data.id} is assigned to someone else`);
      if (pendingApprovalFor(tx, data.id)) throw new KycError(`case ${data.id} already has a pending approval`);

      const updatedAt = new Date().toISOString();
      const needsApproval = decision === "approved" && row.riskTier === "high";
      if (needsApproval) {
        requestApproval(tx, {
          app: APP,
          entityId: data.id,
          action,
          requestedBy: user!.id,
          requiredRole: kycPolicy.approval!.requiredRole,
        });
      }
      return tx
        .update(kycCases)
        .set({ status: needsApproval ? "in_review" : decision, decisionNote: data.note, updatedAt })
        .where(eq(kycCases.id, data.id))
        .returning()
        .get()!;
    },
  });
}

/** An approver decides the pending high-risk approval. decide() enforces role, self-approval, and decide-once. */
export function decideApproval(user: SessionUser | null | undefined, approvalId: number, decision: Decision, note: string): Approval {
  const parsedNote = noteSchema.parse(note);
  const approval = getApproval(approvalId);
  if (!approval || approval.app !== APP) {
    // A probe at another app's approval is a denied attempt: audit it under the approval's real app.
    if (approval) auditDenied(user, approval.app, `approval.${decision}`, approval.entityId);
    throw new KycError(`approval ${approvalId} not found`);
  }
  if (!user) deny(user, `approval.${decision}`, approval.entityId);
  return decide(user, approvalId, decision, parsedNote);
}

/** Registry hook. Runs inside decide()'s transaction. */
export function onKycDecision(tx: Tx, approval: Approval, decision: Decision) {
  const result = tx.update(kycCases)
    .set({ status: decision === "approved" ? "approved" : "in_review", updatedAt: new Date().toISOString() })
    .where(and(eq(kycCases.id, approval.entityId), eq(kycCases.status, "in_review")))
    .run();
  if (result.changes !== 1) throw new KycError(`case ${approval.entityId} is not in_review`);
}

/** One permitted write for tests/contract.test.ts: claim the oldest unclaimed case. */
export function contractClaim(user: SessionUser) {
  const next = db.select({ id: kycCases.id }).from(kycCases).where(eq(kycCases.status, "new")).orderBy(asc(kycCases.id)).get();
  if (!next) throw new KycError("no new case left to claim");
  return claimCase(user, next.id);
}
