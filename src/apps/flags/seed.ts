import type { Tx } from "@/platform/db/client";
import { featureFlags, type FlagRisk } from "./schema";

const FLAGS: ReadonlyArray<[string, string, FlagRisk, boolean, string]> = [
  ["new_dashboard_layout", "Two-column layout on the ops dashboard", "low", true, "Owned by the console UI team"],
  ["refund_bulk_export", "CSV export of the refunds list", "low", false, "Owned by the support tooling team"],
  ["kyc_auto_assign", "Assign new KYC cases round-robin to analysts", "low", true, "Owned by the KYC operations team"],
  ["dark_mode", "Dark theme toggle in the navigation", "low", false, "Owned by the console UI team"],
  ["instant_payouts", "Send refunds through the instant payout rail", "high", false, "Owned by the payments team"],
  ["raise_refund_limit", "Raise the auto-approve refund limit", "high", false, "Owned by the risk team"],
  ["skip_document_check", "Skip the document check for returning customers", "high", true, "Owned by the compliance team"],
  ["new_ledger_writer", "Write refunds to the new ledger service", "high", true, "Owned by the ledger team"],
];

/** Synthetic flags: 4 low risk and 4 high risk, half on. Created by the seeded admin. */
export function seedFlags(tx: Tx) {
  const base = Date.UTC(2026, 9, 1);
  FLAGS.forEach(([key, description, risk, enabled, ownerNote], i) => {
    const ts = new Date(base + i * 3_600_000).toISOString();
    tx.insert(featureFlags)
      .values({
        id: `flg_${String(i + 1).padStart(3, "0")}`,
        key,
        description,
        enabled,
        risk,
        ownerNote,
        createdBy: "u_casey",
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
  });
}
