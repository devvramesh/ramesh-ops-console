import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { approvals, decide, getApproval, listApprovals, requestApproval, type Approval, type Decision } from "@/platform/approvals";
import { AccessDeniedError, auditDenied, listAuditEvents } from "@/platform/audit";
import { db, type Tx } from "@/platform/db/client";
import { mutate } from "@/platform/mutate";
import { can, type SessionUser } from "@/platform/rbac";
import { flagsPolicy } from "./policy";
import { FLAG_RISKS, featureFlags, type FeatureFlag } from "./schema";

const APP = flagsPolicy.app;

export class FlagError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FlagError";
  }
}

const idSchema = z.string().min(1);
const noteSchema = z.string().trim().min(1, "a decision note is required");

export const createFlagSchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{1,63}$/, "key must be 2-64 lowercase letters, digits, or underscores, starting with a letter"),
  description: z.string().trim().min(1, "a description is required").max(200),
  risk: z.enum(FLAG_RISKS),
  ownerNote: z.string().trim().max(500).optional().transform((v) => (v ? v : null)),
});

export type CreateFlagInput = z.input<typeof createFlagSchema>;

function deny(user: SessionUser | null | undefined, action: string, entityId: string | null = null): never {
  auditDenied(user, APP, action, entityId);
  throw new AccessDeniedError(`${user?.id ?? "anonymous"} may not ${APP}.${action}`);
}

function requireRead(user: SessionUser | null | undefined, entityId: string | null = null): SessionUser {
  if (!user || !can(user, APP, "read")) deny(user, "read", entityId);
  return user;
}

function loadFlag(tx: Tx, id: string) {
  return tx.select().from(featureFlags).where(eq(featureFlags.id, id)).get();
}

function pendingApprovalFor(tx: Tx, id: string) {
  return tx
    .select()
    .from(approvals)
    .where(and(eq(approvals.app, APP), eq(approvals.entityId, id), eq(approvals.status, "pending")))
    .get();
}

export function listFlags(user: SessionUser | null | undefined): FeatureFlag[] {
  requireRead(user);
  return db.select().from(featureFlags).orderBy(asc(featureFlags.key)).all();
}

/** Ids of flags with a pending enable request, for the list page. */
export function pendingFlagIds(user: SessionUser | null | undefined): Set<string> {
  requireRead(user);
  return new Set(listApprovals({ app: APP, status: "pending" }).map((a) => a.entityId));
}

export function getFlag(user: SessionUser | null | undefined, id: string): FeatureFlag | undefined {
  requireRead(user, id);
  return db.select().from(featureFlags).where(eq(featureFlags.id, id)).get();
}

export function flagApprovals(user: SessionUser | null | undefined, id: string): Approval[] {
  requireRead(user, id);
  return listApprovals({ app: APP, entityId: id });
}

export function flagAudit(user: SessionUser | null | undefined, id: string) {
  requireRead(user, id);
  return listAuditEvents({ app: APP, entityId: id });
}

/** New flags start off. Turning one on goes through enableFlag. */
export function createFlag(user: SessionUser | null | undefined, input: CreateFlagInput): FeatureFlag {
  return mutate(user, {
    app: APP,
    action: "create",
    schema: createFlagSchema,
    input,
    load: () => null,
    write: (tx, data) => {
      const existing = tx.select({ id: featureFlags.id }).from(featureFlags).where(eq(featureFlags.key, data.key)).get();
      if (existing) throw new FlagError(`a flag with key ${data.key} already exists`);
      const now = new Date().toISOString();
      return tx
        .insert(featureFlags)
        .values({
          id: `flg_${randomUUID().slice(0, 8)}`,
          key: data.key,
          description: data.description,
          enabled: false,
          risk: data.risk,
          ownerNote: data.ownerNote,
          createdBy: user!.id,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
    },
  });
}

/**
 * A low-risk flag turns on immediately. A high-risk flag stays off and gets a pending
 * approval for an approver; onFlagDecision turns it on when that approval is granted.
 */
export function enableFlag(user: SessionUser | null | undefined, id: string): FeatureFlag {
  return mutate(user, {
    app: APP,
    action: "enable",
    schema: z.object({ id: idSchema }),
    input: { id },
    load: (tx) => loadFlag(tx, id),
    write: (tx, data) => {
      const row = loadFlag(tx, data.id);
      if (!row) throw new FlagError(`flag ${data.id} not found`);
      if (row.enabled) throw new FlagError(`flag ${row.key} is already on`);
      if (pendingApprovalFor(tx, data.id)) throw new FlagError(`flag ${row.key} already has a pending enable request`);

      const needsApproval = row.risk === "high";
      if (needsApproval) {
        requestApproval(tx, {
          app: APP,
          entityId: data.id,
          action: "enable",
          requestedBy: user!.id,
          requiredRole: flagsPolicy.approval!.requiredRole,
        });
      }
      return tx
        .update(featureFlags)
        .set({ enabled: !needsApproval, updatedAt: new Date().toISOString() })
        .where(eq(featureFlags.id, data.id))
        .returning()
        .get()!;
    },
  });
}

/** Kill switch: turns any flag off immediately, with no approval. */
export function disableFlag(user: SessionUser | null | undefined, id: string): FeatureFlag {
  return mutate(user, {
    app: APP,
    action: "disable",
    schema: z.object({ id: idSchema }),
    input: { id },
    load: (tx) => loadFlag(tx, id),
    write: (tx, data) => {
      const row = loadFlag(tx, data.id);
      if (!row) throw new FlagError(`flag ${data.id} not found`);
      if (!row.enabled) throw new FlagError(`flag ${row.key} is already off`);
      return tx
        .update(featureFlags)
        .set({ enabled: false, updatedAt: new Date().toISOString() })
        .where(eq(featureFlags.id, data.id))
        .returning()
        .get()!;
    },
  });
}

/** An approver decides a pending enable request. decide() enforces role, self-approval, and decide-once. */
export function decideFlagApproval(user: SessionUser | null | undefined, approvalId: number, decision: Decision, note: string): Approval {
  const parsedNote = noteSchema.parse(note);
  const approval = getApproval(approvalId);
  if (!approval || approval.app !== APP) {
    if (approval) auditDenied(user, approval.app, `approval.${decision}`, approval.entityId);
    throw new FlagError(`approval ${approvalId} not found`);
  }
  if (!user) deny(user, `approval.${decision}`, approval.entityId);
  return decide(user, approvalId, decision, parsedNote);
}

/** Registry hook. Runs inside decide()'s transaction. A rejected request leaves the flag as it is. */
export function onFlagDecision(tx: Tx, approval: Approval, decision: Decision) {
  if (decision !== "approved") return;
  const result = tx
    .update(featureFlags)
    .set({ enabled: true, updatedAt: new Date().toISOString() })
    .where(eq(featureFlags.id, approval.entityId))
    .run();
  if (result.changes !== 1) throw new FlagError(`flag ${approval.entityId} not found`);
}
