import { and, desc, eq } from "drizzle-orm";
import { apps } from "@/apps/registry";
import { auditDenied, newRequestId, writeAudit } from "./audit";
import { approvals, type Approval } from "./approvals/schema";
import { db, type Tx } from "./db/client";
import type { Role, SessionUser } from "./rbac";

export { approvals };
export type { Approval };

export type Decision = "approved" | "rejected";

export class ApprovalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApprovalError";
  }
}

/** Called from inside an app's mutate() write, on the same tx. */
export function requestApproval(
  tx: Tx,
  args: { app: string; entityId: string; action: string; requestedBy: string; requiredRole: Role },
): Approval {
  return tx
    .insert(approvals)
    .values({ ...args, status: "pending", createdAt: new Date().toISOString() })
    .returning()
    .get();
}

export function getApproval(id: number): Approval | undefined {
  return db.select().from(approvals).where(eq(approvals.id, id)).get();
}

export function listApprovals(filter: { app?: string; entityId?: string; status?: string } = {}): Approval[] {
  const conditions = [];
  if (filter.app) conditions.push(eq(approvals.app, filter.app));
  if (filter.entityId) conditions.push(eq(approvals.entityId, filter.entityId));
  if (filter.status) conditions.push(eq(approvals.status, filter.status));
  return db
    .select()
    .from(approvals)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(approvals.id))
    .all();
}

/**
 * Decides a pending approval. The requester can't decide their own request.
 * The decider must hold the required role. The update is guarded by status = 'pending'
 * and fails unless exactly one row changed. onDecision and the audit row run in the same transaction.
 */
export function decide(user: SessionUser, approvalId: number, decision: Decision, note: string): Approval {
  const approval = getApproval(approvalId);
  if (!approval) throw new ApprovalError(`approval ${approvalId} not found`);
  const action = `approval.${decision}`;
  const entry = apps.find((a) => a.policy.app === approval.app);
  if (!entry) {
    auditDenied(user, approval.app, action, approval.entityId);
    throw new ApprovalError(`app ${approval.app} is not registered`);
  }

  if (approval.requestedBy === user.id) {
    auditDenied(user, approval.app, action, approval.entityId);
    throw new ApprovalError(`user ${user.id} requested approval ${approval.id} and cannot decide it`);
  }
  if (!user.roles.includes(approval.requiredRole as Role)) {
    auditDenied(user, approval.app, action, approval.entityId);
    throw new ApprovalError(`user ${user.id} lacks role ${approval.requiredRole} for approval ${approval.id}`);
  }

  const decidedAt = new Date().toISOString();

  let noLongerPending = false;
  try {
    return db.transaction((tx) => {
      const result = tx
        .update(approvals)
        .set({ status: decision, decidedBy: user.id, note, decidedAt })
        .where(and(eq(approvals.id, approval.id), eq(approvals.status, "pending")))
        .run();
      if (result.changes !== 1) {
        noLongerPending = true;
        throw new ApprovalError(`approval ${approval.id} is no longer pending`);
      }

      const decided: Approval = { ...approval, status: decision, decidedBy: user.id, note, decidedAt };
      entry.onDecision?.(tx, decided, decision);

      writeAudit(tx, {
        actorId: user.id,
        actorRole: approval.requiredRole as Role,
        action,
        app: approval.app,
        entityId: approval.entityId,
        outcome: "ok",
        before: { approvalId: approval.id, status: "pending" },
        after: { approvalId: approval.id, status: decision, note },
        requestId: newRequestId(),
      });
      return decided;
    });
  } catch (err) {
    // The denied row is written after the rolled-back transaction so it survives.
    if (noLongerPending) auditDenied(user, approval.app, action, approval.entityId);
    throw err;
  }
}
