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
  createdAt: string;
  /** Set for refunds over the threshold: who decided, or null while pending. */
  approval?: { decidedBy: string | null; decision?: "approved" | "rejected"; note?: string };
  processorRef?: string;
};

const ROWS: SeedRefund[] = [
  { id: "rf_seed_0001", customerRef: "cus_1001", customerEmail: "ada.lovelace@example.com", amountCents: 1999, reason: "Duplicate charge", status: "approved", createdBy: "u_sam", createdAt: "2026-10-01T14:02:00.000Z" },
  { id: "rf_seed_0002", customerRef: "cus_1002", customerEmail: "grace.hopper@example.com", amountCents: 4500, reason: "Service outage credit", status: "paid", createdBy: "u_sam", createdAt: "2026-10-02T09:15:00.000Z", processorRef: "fake_seed00000002" },
  { id: "rf_seed_0003", customerRef: "cus_1003", customerEmail: "alan.turing@example.com", amountCents: 50000, reason: "Cancelled annual plan", status: "approved", createdBy: "u_riley", createdAt: "2026-10-03T11:40:00.000Z" },
  { id: "rf_seed_0004", customerRef: "cus_1004", customerEmail: "katherine.johnson@example.com", amountCents: 72500, reason: "Billing error on invoice 4411", status: "pending_approval", createdBy: "u_sam", createdAt: "2026-10-05T16:20:00.000Z", approval: { decidedBy: null } },
  { id: "rf_seed_0005", customerRef: "cus_1005", customerEmail: "margaret.hamilton@example.com", amountCents: 125000, reason: "Chargeback settlement", status: "approved", createdBy: "u_sam", createdAt: "2026-10-06T10:05:00.000Z", approval: { decidedBy: "u_avery", decision: "approved", note: "Confirmed with finance" } },
  { id: "rf_seed_0006", customerRef: "cus_1006", customerEmail: "dorothy.vaughan@example.com", amountCents: 98000, reason: "Goodwill after escalation", status: "rejected", createdBy: "u_riley", createdAt: "2026-10-07T13:30:00.000Z", approval: { decidedBy: "u_avery", decision: "rejected", note: "Exceeds goodwill policy" } },
  { id: "rf_seed_0007", customerRef: "cus_1007", customerEmail: "mary.jackson@example.com", amountCents: 250000, reason: "Hardware return", status: "paid", createdBy: "u_sam", createdAt: "2026-10-08T08:45:00.000Z", approval: { decidedBy: "u_avery", decision: "approved", note: "Return received" }, processorRef: "fake_seed00000007" },
  { id: "rf_seed_0008", customerRef: "cus_1008", customerEmail: "hedy.lamarr@example.com", amountCents: 999, reason: "Promo code not applied", status: "paid", createdBy: "u_riley", createdAt: "2026-10-10T17:55:00.000Z", processorRef: "fake_seed00000008" },
  { id: "rf_seed_0009", customerRef: "cus_1009", customerEmail: "radia.perlman@example.com", amountCents: 60000, reason: "Double shipment", status: "pending_approval", createdBy: "u_riley", createdAt: "2026-10-12T12:10:00.000Z", approval: { decidedBy: null } },
  { id: "rf_seed_0010", customerRef: "cus_1010", customerEmail: "annie.easley@example.com", amountCents: 30000, reason: "Downgrade proration", status: "approved", createdBy: "u_sam", createdAt: "2026-10-14T15:00:00.000Z" },
  { id: "rf_seed_0011", customerRef: "cus_1011", customerEmail: "barbara.liskov@example.com", amountCents: 500000, reason: "Contract termination", status: "rejected", createdBy: "u_sam", createdAt: "2026-10-16T09:30:00.000Z", approval: { decidedBy: "u_avery", decision: "rejected", note: "Needs legal review first" } },
  { id: "rf_seed_0012", customerRef: "cus_1012", customerEmail: "frances.allen@example.com", amountCents: 80000, reason: "Wrong plan tier billed", status: "pending_approval", createdBy: "u_sam", createdAt: "2026-10-18T18:25:00.000Z", approval: { decidedBy: null } },
];

export function seedRefunds(tx: Tx) {
  for (const r of ROWS) {
    const updatedAt = r.status === "pending_approval" ? r.createdAt : new Date(Date.parse(r.createdAt) + 3600_000).toISOString();
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
        createdAt: r.createdAt,
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
          createdAt: r.createdAt,
          decidedAt: r.approval.decidedBy ? updatedAt : null,
        })
        .run();
    }
  }
}
