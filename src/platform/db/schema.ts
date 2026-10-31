import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
});

export const userRoles = sqliteTable(
  "user_roles",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.role] })],
);

export const auditEvents = sqliteTable(
  "audit_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ts: text("ts").notNull(),
    actorId: text("actor_id").notNull(),
    actorRole: text("actor_role"),
    action: text("action").notNull(),
    app: text("app").notNull(),
    entityId: text("entity_id"),
    outcome: text("outcome").notNull(),
    beforeJson: text("before_json"),
    afterJson: text("after_json"),
    requestId: text("request_id").notNull(),
  },
  (t) => [
    index("audit_events_app_idx").on(t.app),
    index("audit_events_entity_idx").on(t.app, t.entityId),
  ],
);

export type AuditEvent = typeof auditEvents.$inferSelect;
