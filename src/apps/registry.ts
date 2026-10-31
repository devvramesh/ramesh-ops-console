import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import type { Approval, Decision } from "@/platform/approvals";
import type { Tx } from "@/platform/db/client";
import type { AppPolicy, SessionUser } from "@/platform/rbac";

export type AppEntry = {
  policy: AppPolicy;
  /** The app's main table. tests/contract.test.ts checks policy.pii against its columns. */
  table: SQLiteTable;
  /** Inserts synthetic rows. Run by db:reset inside one transaction. */
  seed: (tx: Tx) => void;
  /** Called by decide() in the same transaction as the approval update and audit row. */
  onDecision?: (tx: Tx, approval: Approval, decision: Decision) => void;
  /** One permitted write, run by tests/contract.test.ts as a seeded user who holds a role listed for `action`. */
  contractWrite: { action: string; run: (user: SessionUser) => unknown | Promise<unknown> };
};

// One entry per app. This is the only file apps share.
export const apps: AppEntry[] = [];
