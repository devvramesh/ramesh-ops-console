import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const leakyMembers = sqliteTable("leaky_members", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  memberRef: text("member_ref").notNull(),
  memberSsn: text("member_ssn").notNull(),
  status: text("status").notNull().default("new"),
});

export type LeakyMember = typeof leakyMembers.$inferSelect;
