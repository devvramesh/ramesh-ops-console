import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  type Approval,
  ApprovalError,
  type Decision,
  decide,
  getApproval,
  listApprovals,
  requestApproval,
} from "@/platform/approvals";
import { AccessDeniedError, auditDenied, listAuditEvents, newRequestId, writeAudit } from "@/platform/audit";
import type { Tx } from "@/platform/db/client";
import { db } from "@/platform/db/client";
import { payments } from "@/platform/integrations/payments";
import { mutate } from "@/platform/mutate";
import { authorizingRole, can, type SessionUser } from "@/platform/rbac";
import { APPROVAL_THRESHOLD_CENTS, MAX_AMOUNT_CENTS, refundsPolicy } from "./policy";
import { type Refund, refunds } from "./schema";

const APP = refundsPolicy.app;

export class RefundStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RefundStateError";
  }
}

export const createRefundSchema = z.object({
  customerRef: z.string().trim().min(1).max(64),
  customerEmail: z.email().max(254),
  amountCents: z.number().int().positive().max(MAX_AMOUNT_CENTS),
  currency: z.literal("USD"),
  reason: z.string().trim().min(1).max(500),
});
export type CreateRefundInput = z.input<typeof createRefundSchema>;

const paySchema = z.object({
  id: z.string().min(1),
  processorRef: z.string().min(1),
});

function denyUnless(user: SessionUser | null | undefined, action: string, entityId: string | null = null) {
  if (can(user, APP, action)) return;
  auditDenied(user, APP, action, entityId);
  throw new AccessDeniedError(`${user?.id ?? "anonymous"} may not ${APP}.${action}`);
}

/** "600" or "600.50" to integer cents without going through a float. */
export function dollarsToCents(text: string): number | null {
  const m = /^\s*\$?\s*(\d{1,9})(?:\.(\d{1,2}))?\s*$/.exec(text);
  if (!m) return null;
  const cents = (m[2] ?? "").padEnd(2, "0");
  return Number(m[1]) * 100 + Number(cents);
}

export function formatCents(cents: number) {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}$${Math.floor(abs / 100).toLocaleString("en-US")}.${String(abs % 100).padStart(2, "0")}`;
}

export function maskEmail(email: string) {
  const at = email.indexOf("@");
  if (at < 1) return "***";
  return `${email[0]}***${email.slice(at)}`;
}

export function listRefunds(user: SessionUser | null | undefined): Refund[] {
  denyUnless(user, "read");
  return db.select().from(refunds).orderBy(desc(refunds.createdAt), desc(refunds.id)).all();
}

export function getRefund(user: SessionUser | null | undefined, id: string): Refund | null {
  denyUnless(user, "read", id);
  return db.select().from(refunds).where(eq(refunds.id, id)).get() ?? null;
}

export function listRefundApprovals(user: SessionUser | null | undefined, id: string): Approval[] {
  denyUnless(user, "read", id);
  return listApprovals({ app: APP, entityId: id });
}

export function listRefundAudit(user: SessionUser | null | undefined, id: string) {
  denyUnless(user, "read", id);
  return listAuditEvents({ app: APP, entityId: id });
}

export function pendingApprovalFor(id: string): Approval | undefined {
  return listApprovals({ app: APP, entityId: id, status: "pending" })[0];
}

/**
 * Over the threshold: inserted as pending_approval with an approval request on the same tx.
 * At or under: inserted as approved and audited as refund.auto_approved alongside the create row.
 */
export function createRefund(user: SessionUser | null | undefined, input: CreateRefundInput): Refund {
  const requestId = newRequestId();
  return mutate(user, {
    app: APP,
    action: "create",
    schema: createRefundSchema,
    input,
    requestId,
    load: () => null,
    write: (tx, data) => {
      const now = new Date().toISOString();
      const needsApproval = data.amountCents > APPROVAL_THRESHOLD_CENTS;
      const row = tx
        .insert(refunds)
        .values({
          id: `rf_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
          ...data,
          status: needsApproval ? "pending_approval" : "approved",
          createdBy: user!.id,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();

      if (needsApproval) {
        requestApproval(tx, {
          app: APP,
          entityId: row.id,
          action: "approve",
          requestedBy: user!.id,
          requiredRole: refundsPolicy.approval!.requiredRole,
        });
      } else {
        writeAudit(tx, {
          actorId: user!.id,
          actorRole: authorizingRole(user, APP, "create"),
          action: "refund.auto_approved",
          app: APP,
          entityId: row.id,
          outcome: "ok",
          before: null,
          after: { id: row.id, status: "approved", amountCents: row.amountCents, thresholdCents: APPROVAL_THRESHOLD_CENTS },
          requestId,
        });
      }
      return row;
    },
  });
}

/** Approve or reject through decide(). The platform rejects self-approval, the wrong role, and a second decision. */
export function decideRefund(user: SessionUser | null | undefined, approvalId: number, decision: Decision, note: string): Approval {
  const action = decision === "approved" ? "approve" : "reject";
  const approval = getApproval(approvalId);
  if (!approval || approval.app !== APP) {
    // A probe at another app's approval is a denied attempt: audit it under the approval's real app.
    if (approval) auditDenied(user, approval.app, `approval.${decision}`, approval.entityId);
    else denyUnless(user, action);
    throw new ApprovalError(`approval ${approvalId} not found`);
  }
  denyUnless(user, action, approval.entityId);
  return decide(user!, approval.id, decision, note);
}

/** Runs inside decide()'s transaction. Moves the refund out of pending_approval. */
export function onRefundDecision(tx: Tx, approval: Approval, decision: Decision) {
  const result = tx
    .update(refunds)
    .set({ status: decision === "approved" ? "approved" : "rejected", updatedAt: new Date().toISOString() })
    .where(and(eq(refunds.id, approval.entityId), eq(refunds.status, "pending_approval")))
    .run();
  if (result.changes !== 1) throw new RefundStateError(`refund ${approval.entityId} is not pending approval`);
}

/** Calls the payment processor with the refund id as idempotency key, then records the processor reference. */
export async function payRefund(user: SessionUser | null | undefined, id: string): Promise<Refund> {
  denyUnless(user, "pay", id);
  const current = db.select().from(refunds).where(eq(refunds.id, id)).get();
  if (!current) throw new RefundStateError(`refund ${id} not found`);
  if (current.status !== "approved") throw new RefundStateError(`refund ${id} is ${current.status}, not approved`);

  const result = await payments.refund({
    idempotencyKey: current.id,
    amountCents: current.amountCents,
    currency: "USD",
    customerRef: current.customerRef,
  });

  return mutate(user, {
    app: APP,
    action: "pay",
    schema: paySchema,
    input: { id, processorRef: result.processorRef },
    load: (tx) => tx.select().from(refunds).where(eq(refunds.id, id)).get(),
    write: (tx, data) => {
      const row = tx
        .update(refunds)
        .set({ status: "paid", processorRef: data.processorRef, updatedAt: new Date().toISOString() })
        .where(and(eq(refunds.id, data.id), eq(refunds.status, "approved")))
        .returning()
        .get();
      if (!row) throw new RefundStateError(`refund ${data.id} is no longer approved`);
      return row;
    },
  });
}
