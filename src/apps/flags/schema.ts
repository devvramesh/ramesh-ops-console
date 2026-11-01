import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const FLAG_RISKS = ["low", "high"] as const;
export type FlagRisk = (typeof FLAG_RISKS)[number];

export const featureFlags = sqliteTable(
  "feature_flags",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull().unique(),
    description: text("description").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
    risk: text("risk").notNull(),
    ownerNote: text("owner_note"),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("feature_flags_risk_idx").on(t.risk)],
);

export type FeatureFlag = typeof featureFlags.$inferSelect;
