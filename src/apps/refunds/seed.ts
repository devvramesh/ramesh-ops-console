import { approvals } from "@/platform/approvals/schema";
import type { Tx } from "@/platform/db/client";
import { type RefundStatus, refunds } from "./schema";

type SeedRefund = {
  id: string;
  customerRef: string;
  customerEmail: string;
  amountCents: number;
  reason: string;
  status: RefundStatus;
  createdBy: string;
  daysAgo: number;
  /** Set for refunds over the threshold: who decided, or null while pending. */
  approval?: { decidedBy: string | null; decision?: "approved" | "rejected"; note?: string };
  processorRef?: string;
};

const ROWS: SeedRefund[] = [
  { id: "rf_seed_0001", customerRef: "cus_1001", customerEmail: "ada.lovelace@example.com", amountCents: 1999, reason: "Duplicate charge", status: "approved", createdBy: "u_sam", daysAgo: 17 },
  { id: "rf_seed_0002", customerRef: "cus_1002", customerEmail: "grace.hopper@example.com", amountCents: 4500, reason: "Service outage credit", status: "paid", createdBy: "u_sam", daysAgo: 16, processorRef: "fake_seed00000002" },
  { id: "rf_seed_0003", customerRef: "cus_1003", customerEmail: "alan.turing@example.com", amountCents: 50000, reason: "Cancelled annual plan", status: "approved", createdBy: "u_riley", daysAgo: 15 },
  { id: "rf_seed_0004", customerRef: "cus_1004", customerEmail: "katherine.johnson@example.com", amountCents: 72500, reason: "Billing error on invoice 4411", status: "pending_approval", createdBy: "u_sam", daysAgo: 13, approval: { decidedBy: null } },
  { id: "rf_seed_0005", customerRef: "cus_1005", customerEmail: "margaret.hamilton@example.com", amountCents: 125000, reason: "Chargeback settlement", status: "approved", createdBy: "u_sam", daysAgo: 12, approval: { decidedBy: "u_avery", decision: "approved", note: "Confirmed with finance" } },
  { id: "rf_seed_0006", customerRef: "cus_1006", customerEmail: "dorothy.vaughan@example.com", amountCents: 98000, reason: "Goodwill after escalation", status: "rejected", createdBy: "u_riley", daysAgo: 11, approval: { decidedBy: "u_avery", decision: "rejected", note: "Exceeds goodwill policy" } },
  { id: "rf_seed_0007", customerRef: "cus_1007", customerEmail: "mary.jackson@example.com", amountCents: 250000, reason: "Hardware return", status: "paid", createdBy: "u_sam", daysAgo: 10, approval: { decidedBy: "u_avery", decision: "approved", note: "Return received" }, processorRef: "fake_seed00000007" },
  { id: "rf_seed_0008", customerRef: "cus_1008", customerEmail: "hedy.lamarr@example.com", amountCents: 999, reason: "Promo code not applied", status: "paid", createdBy: "u_riley", daysAgo: 8, processorRef: "fake_seed00000008" },
  { id: "rf_seed_0009", customerRef: "cus_1009", customerEmail: "radia.perlman@example.com", amountCents: 60000, reason: "Double shipment", status: "pending_approval", createdBy: "u_riley", daysAgo: 6, approval: { decidedBy: null } },
  { id: "rf_seed_0010", customerRef: "cus_1010", customerEmail: "annie.easley@example.com", amountCents: 30000, reason: "Downgrade proration", status: "approved", createdBy: "u_sam", daysAgo: 4 },
  { id: "rf_seed_0011", customerRef: "cus_1011", customerEmail: "barbara.liskov@example.com", amountCents: 500000, reason: "Contract termination", status: "rejected", createdBy: "u_sam", daysAgo: 2, approval: { decidedBy: "u_avery", decision: "rejected", note: "Needs legal review first" } },
  { id: "rf_seed_0012", customerRef: "cus_1012", customerEmail: "frances.allen@example.com", amountCents: 80000, reason: "Wrong plan tier billed", status: "pending_approval", createdBy: "u_sam", daysAgo: 0, approval: { decidedBy: null } },
];

export function seedRefunds(tx: Tx) {
  const now = Date.now();
  for (const r of ROWS) {
    const createdAt = new Date(now - r.daysAgo * 86400_000).toISOString();
    const updatedAt = r.status === "pending_approval" ? createdAt : new Date(Date.parse(createdAt) + 3600_000).toISOString();
    tx.insert(refunds)
      .values({
        id: r.id,
        customerRef: r.customerRef,
        customerEmail: r.customerEmail,
        amountCents: r.amountCents,
        currency: "USD",
        reason: r.reason,
        status: r.status,
        processorRef: r.processorRef ?? null,
        createdBy: r.createdBy,
        createdAt,
        updatedAt,
      })
      .run();
    if (r.approval) {
      tx.insert(approvals)
        .values({
          app: "refunds",
          entityId: r.id,
          action: "approve",
          requestedBy: r.createdBy,
          requiredRole: "approver",
          status: r.approval.decision ?? "pending",
          decidedBy: r.approval.decidedBy,
          note: r.approval.note ?? null,
          createdAt,
          decidedAt: r.approval.decidedBy ? updatedAt : null,
        })
        .run();
    }
  }
}
