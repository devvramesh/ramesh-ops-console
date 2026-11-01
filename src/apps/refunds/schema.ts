import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const REFUND_STATUSES = ["pending_approval", "approved", "rejected", "paid"] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

/** Finance reports on these. Fixed list; adding a code is a code change. */
export const REFUND_REASON_CODES = ["duplicate_charge", "fraud", "service_issue", "goodwill"] as const;
export type RefundReasonCode = (typeof REFUND_REASON_CODES)[number];

export const REFUND_REASON_LABELS: Record<RefundReasonCode, string> = {
  duplicate_charge: "Duplicate charge",
  fraud: "Fraud",
  service_issue: "Service issue",
  goodwill: "Goodwill",
};

export const refunds = sqliteTable(
  "refunds",
  {
    id: text("id").primaryKey(),
    customerRef: text("customer_ref").notNull(),
    customerEmail: text("customer_email").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("USD"),
    reasonCode: text("reason_code", { enum: REFUND_REASON_CODES }).notNull(),
    reason: text("reason").notNull(),
    status: text("status").notNull().default("pending_approval"),
    processorRef: text("processor_ref"),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("refunds_status_idx").on(t.status)],
);

export type Refund = typeof refunds.$inferSelect;
