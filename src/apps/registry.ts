import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import type { Approval, Decision } from "@/platform/approvals";
import type { Tx } from "@/platform/db/client";
import type { AppPolicy, SessionUser } from "@/platform/rbac";
import { flagsPolicy } from "./flags/policy";
import { featureFlags } from "./flags/schema";
import { seedFlags } from "./flags/seed";
import { createFlag, onFlagDecision } from "./flags/service";
import { kycPolicy } from "./kyc/policy";
import { kycCases } from "./kyc/schema";
import { seedKyc } from "./kyc/seed";
import { contractClaim, onKycDecision } from "./kyc/service";
import { refundsPolicy } from "./refunds/policy";
import { refunds } from "./refunds/schema";
import { seedRefunds } from "./refunds/seed";
import { createRefund, onRefundDecision } from "./refunds/service";

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
export const apps: AppEntry[] = [
  {
    policy: refundsPolicy,
    table: refunds,
    seed: seedRefunds,
    onDecision: onRefundDecision,
    contractWrite: {
      action: "create",
      run: (user) =>
        createRefund(user, {
          customerRef: "cus_contract",
          customerEmail: "contract.check@example.com",
          amountCents: 75000,
          currency: "USD",
          reasonCode: "goodwill",
          reason: "contract test",
        }),
    },
  },
  {
    policy: kycPolicy,
    table: kycCases,
    seed: seedKyc,
    onDecision: onKycDecision,
    contractWrite: { action: "claim", run: contractClaim },
  },
  {
    policy: flagsPolicy,
    table: featureFlags,
    seed: seedFlags,
    onDecision: onFlagDecision,
    contractWrite: {
      action: "create",
      run: (user) =>
        createFlag(user, {
          key: "contract_check",
          description: "contract test",
          risk: "low",
          ownerNote: "Owned by the contract test",
        }),
    },
  },
];
