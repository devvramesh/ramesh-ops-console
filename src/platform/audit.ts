import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db, type Db, type Tx } from "./db/client";
import { auditEvents, type AuditEvent } from "./db/schema";
import { authorizingRole, type Role, type SessionUser } from "./rbac";
import { redact } from "./redact";

export type AuditOutcome = "ok" | "denied";

export type AuditInput = {
  actorId: string;
  actorRole: Role | null;
  action: string;
  app: string;
  entityId: string | null;
  outcome: AuditOutcome;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  requestId?: string;
};

export class AccessDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccessDeniedError";
  }
}

export function newRequestId() {
  return randomUUID();
}

/** Inserts one audit row. Before/after JSON is redacted with the app's policy. */
export function writeAudit(tx: Tx | Db, e: AuditInput) {
  tx.insert(auditEvents)
    .values({
      ts: new Date().toISOString(),
      actorId: e.actorId,
      actorRole: e.actorRole,
      action: e.action,
      app: e.app,
      entityId: e.entityId,
      outcome: e.outcome,
      beforeJson: e.before ? JSON.stringify(redact(e.app, e.before)) : null,
      afterJson: e.after ? JSON.stringify(redact(e.app, e.after)) : null,
      requestId: e.requestId ?? newRequestId(),
    })
    .run();
}

/** Records a denied attempt outside any transaction so a later rollback can't remove it. */
export function auditDenied(user: SessionUser | null | undefined, app: string, action: string, entityId: string | null = null) {
  writeAudit(db, {
    actorId: user?.id ?? "anonymous",
    actorRole: null,
    action,
    app,
    entityId,
    outcome: "denied",
    before: null,
    after: null,
  });
}

/** Audited read, for exports and downloads. `detail` is redacted like any other audit JSON. */
export function recordAccess(
  user: SessionUser | null | undefined,
  args: { app: string; action: string; entityId?: string | null; detail?: Record<string, unknown> },
) {
  const role = authorizingRole(user, args.app, args.action);
  if (!user || !role) {
    auditDenied(user, args.app, args.action, args.entityId ?? null);
    throw new AccessDeniedError(`${user?.id ?? "anonymous"} may not ${args.app}.${args.action}`);
  }
  writeAudit(db, {
    actorId: user.id,
    actorRole: role,
    action: args.action,
    app: args.app,
    entityId: args.entityId ?? null,
    outcome: "ok",
    before: null,
    after: args.detail ?? null,
  });
}

export function listAuditEvents(filter: { app?: string; entityId?: string; limit?: number } = {}): AuditEvent[] {
  const conditions = [];
  if (filter.app) conditions.push(eq(auditEvents.app, filter.app));
  if (filter.entityId) conditions.push(eq(auditEvents.entityId, filter.entityId));
  return db
    .select()
    .from(auditEvents)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(auditEvents.id))
    .limit(filter.limit ?? 500)
    .all();
}
