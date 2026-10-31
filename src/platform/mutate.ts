import type { z } from "zod";
import { AccessDeniedError, auditDenied, newRequestId, writeAudit } from "./audit";
import { db, type Tx } from "./db/client";
import { authorizingRole, type SessionUser } from "./rbac";

export type EntityRow = Record<string, unknown> & { id: string | number };

export type MutateArgs<S extends z.ZodType, R extends EntityRow> = {
  app: string;
  action: string;
  schema: S;
  input: unknown;
  /** The row before the write, or null for a create. */
  load: (tx: Tx) => R | null | undefined;
  /** The write. Returns the row after the write. */
  write: (tx: Tx, data: z.output<S>) => R;
  requestId?: string;
};

/**
 * The only way apps write. Checks can(), validates input, then in one transaction
 * loads the before row, runs the write, and inserts one audit row.
 * A denied attempt writes one audit row with outcome "denied" and throws.
 */
export function mutate<S extends z.ZodType, R extends EntityRow>(user: SessionUser | null | undefined, args: MutateArgs<S, R>): R {
  const role = authorizingRole(user, args.app, args.action);
  if (!user || !role) {
    auditDenied(user, args.app, args.action);
    throw new AccessDeniedError(`${user?.id ?? "anonymous"} may not ${args.app}.${args.action}`);
  }

  const data = args.schema.parse(args.input) as z.output<S>;
  const requestId = args.requestId ?? newRequestId();

  return db.transaction((tx) => {
    const before = args.load(tx) ?? null;
    const after = args.write(tx, data);
    writeAudit(tx, {
      actorId: user.id,
      actorRole: role,
      action: args.action,
      app: args.app,
      entityId: String(after.id ?? before?.id ?? ""),
      outcome: "ok",
      before,
      after,
      requestId,
    });
    return after;
  });
}
