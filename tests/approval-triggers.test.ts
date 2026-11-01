import { eq } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import { apps, type AppEntry } from "@/apps/registry";
import { approvals, decide, getApproval, requestApproval } from "@/platform/approvals";
import { loadUser } from "@/platform/auth";
import { db, sqlite } from "@/platform/db/client";
import type { SessionUser } from "@/platform/rbac";

const triggerNotes = sqliteTable("test_trigger_notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  label: text("label").notNull(),
});

const fixture: AppEntry = {
  policy: {
    app: "triggernotes",
    title: "Trigger notes",
    description: "fixture",
    permissions: { read: ["support"] },
    pii: [],
    approval: { requiredRole: "approver", rule: "fixture approval" },
  },
  table: triggerNotes,
  seed: () => {},
  contractWrite: { action: "create", run: () => {} },
};

apps.push(fixture);

function user(id: string): SessionUser {
  const u = loadUser(id);
  if (!u) throw new Error(`missing seeded user ${id}`);
  return u;
}

/** Inserts a pending approval row the way apps do, inside one transaction. */
function pendingApproval(requestedBy: string): number {
  return db.transaction((tx) =>
    requestApproval(tx, {
      app: "triggernotes",
      entityId: "n1",
      action: "approve",
      requestedBy,
      requiredRole: "approver",
    }),
  ).id;
}

describe("approval triggers", () => {
  it("rejects a decision written by the requester, even inside a raw transaction", () => {
    const id = pendingApproval("u_riley");
    const write = sqlite.transaction(() => {
      sqlite.prepare("UPDATE approvals SET status = 'approved', decided_by = 'u_riley' WHERE id = ?").run(id);
    });
    expect(() => write()).toThrow(/cannot decide their own approval/);
    expect(getApproval(id)).toMatchObject({ status: "pending", decidedBy: null });
    expect(decide(user("u_avery"), id, "approved", "ok").status).toBe("approved");
  });

  it("rejects any update to a non-pending approval, even inside a raw transaction", () => {
    const id = pendingApproval("u_sam");
    expect(decide(user("u_avery"), id, "rejected", "no").status).toBe("rejected");

    const reopen = sqlite.transaction(() => {
      sqlite.prepare("UPDATE approvals SET status = 'pending', decided_by = NULL WHERE id = ?").run(id);
    });
    expect(() => reopen()).toThrow(/no longer pending/);

    const edit = sqlite.transaction(() => {
      sqlite.prepare("UPDATE approvals SET note = 'edited after the fact' WHERE id = ?").run(id);
    });
    expect(() => edit()).toThrow(/no longer pending/);

    expect(getApproval(id)).toMatchObject({ status: "rejected", decidedBy: "u_avery" });
  });

  it("still allows ordinary writes to pending approvals", () => {
    const id = pendingApproval("u_sam");
    db.update(approvals).set({ note: "still pending" }).where(eq(approvals.id, id)).run();
    expect(getApproval(id)?.note).toBe("still pending");
  });
});
