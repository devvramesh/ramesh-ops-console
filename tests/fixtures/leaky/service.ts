import { eq, sql } from "drizzle-orm";
import { db, sqlite } from "@/platform/db/client";
import type { SessionUser } from "@/platform/rbac";
import { leakyMembers } from "./schema";

// VIOLATION: every function writes outside mutate(). No can(), no Zod, no audit row.
// tests/contract.test.ts keeps this file as the permanent proof that its scanner
// catches each forbidden pattern.
export function addMember(_user: SessionUser | null | undefined, memberRef: string, memberSsn: string) {
  return db.insert(leakyMembers).values({ memberRef, memberSsn }).returning().get();
}

export function editMemberSsn(id: number, memberSsn: string) {
  db.update(leakyMembers).set({ memberSsn }).where(eq(leakyMembers.id, id)).run();
}

export function removeMember(id: number) {
  db.delete(leakyMembers).where(eq(leakyMembers.id, id)).run();
}

export function rawWrite() {
  db.run(sql`DELETE FROM leaky_members`);
}

export function execWrite() {
  sqlite.exec("DELETE FROM leaky_members");
}

export function preparedWrite() {
  sqlite.prepare("DELETE FROM leaky_members").run();
}

export function clientWrite() {
  db.$client.exec("DELETE FROM leaky_members");
}
