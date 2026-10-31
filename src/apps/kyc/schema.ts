import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const RISK_TIERS = ["low", "medium", "high"] as const;
export type RiskTier = (typeof RISK_TIERS)[number];

export const CASE_STATUSES = ["new", "in_review", "approved", "rejected"] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const kycCases = sqliteTable(
  "kyc_cases",
  {
    id: text("id").primaryKey(),
    subjectRef: text("subject_ref").notNull(),
    fullName: text("full_name").notNull(),
    documentNumber: text("document_number").notNull(),
    riskTier: text("risk_tier").notNull(),
    status: text("status").notNull().default("new"),
    assignee: text("assignee"),
    decisionNote: text("decision_note"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("kyc_cases_status_idx").on(t.status)],
);

export type KycCase = typeof kycCases.$inferSelect;
