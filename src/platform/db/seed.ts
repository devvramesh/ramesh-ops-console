import type { Role } from "../rbac";
import type { Tx } from "./client";
import { userRoles, users } from "./schema";

export const SEEDED_USERS: ReadonlyArray<{ id: string; name: string; roles: Role[] }> = [
  { id: "u_sam", name: "Sam", roles: ["support"] },
  { id: "u_riley", name: "Riley", roles: ["support", "approver"] },
  { id: "u_avery", name: "Avery", roles: ["approver"] },
  { id: "u_jordan", name: "Jordan", roles: ["analyst"] },
  { id: "u_morgan", name: "Morgan", roles: ["analyst"] },
  { id: "u_quinn", name: "Quinn", roles: ["auditor"] },
  { id: "u_casey", name: "Casey", roles: ["admin"] },
];

export function seedUsers(tx: Tx) {
  for (const u of SEEDED_USERS) {
    tx.insert(users).values({ id: u.id, name: u.name }).run();
    for (const role of u.roles) {
      tx.insert(userRoles).values({ userId: u.id, role }).run();
    }
  }
}
