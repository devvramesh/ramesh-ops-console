import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const approvals = sqliteTable(
  "approvals",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    app: text("app").notNull(),
    entityId: text("entity_id").notNull(),
    action: text("action").notNull(),
    requestedBy: text("requested_by").notNull(),
    requiredRole: text("required_role").notNull(),
    status: text("status").notNull().default("pending"),
    decidedBy: text("decided_by"),
    note: text("note"),
    createdAt: text("created_at").notNull(),
    decidedAt: text("decided_at"),
  },
  (t) => [index("approvals_entity_idx").on(t.app, t.entityId)],
);

export type Approval = typeof approvals.$inferSelect;
