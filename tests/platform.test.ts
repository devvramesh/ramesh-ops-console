import { eq, sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { apps, type AppEntry } from "@/apps/registry";
import { decide, requestApproval } from "@/platform/approvals";
import { AccessDeniedError, listAuditEvents } from "@/platform/audit";
import { loadUser } from "@/platform/auth";
import { db, sqlite } from "@/platform/db/client";
import { auditEvents } from "@/platform/db/schema";
import { mutate } from "@/platform/mutate";
import { can, type SessionUser } from "@/platform/rbac";
import { REDACTED } from "@/platform/redact";

// A fixture app registered only in this test file.
const notes = sqliteTable("test_notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  email: text("email").notNull(),
  status: text("status").notNull().default("open"),
});

const fixture: AppEntry = {
  policy: {
    app: "notes",
    title: "Notes",
    description: "fixture",
    permissions: { read: ["support", "auditor"], create: ["support"], close: ["approver"] },
    pii: ["email"],
    approval: { requiredRole: "approver", rule: "closing a note needs an approver" },
  },
  table: notes,
  seed: () => {},
  contractWrite: { action: "create", run: () => {} },
};

function user(id: string): SessionUser {
  const u = loadUser(id);
  if (!u) throw new Error(`missing seeded user ${id}`);
  return u;
}

function auditCount(app: string) {
  return db.select({ n: sql<number>`count(*)` }).from(auditEvents).where(eq(auditEvents.app, app)).get()!.n;
}

function createNote(actor: SessionUser, email = "someone@example.com") {
  return mutate(actor, {
    app: "notes",
    action: "create",
    schema: z.object({ title: z.string().min(1), email: z.string().email() }),
    input: { title: "hello", email },
    load: () => null,
    write: (tx, data) => tx.insert(notes).values(data).returning().get(),
  });
}

beforeAll(() => {
  sqlite.exec(
    "CREATE TABLE IF NOT EXISTS test_notes (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, email TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open')",
  );
  if (!apps.includes(fixture)) apps.push(fixture);
});

describe("rbac", () => {
  it("denies an action missing from the policy, for every role including admin", () => {
    for (const id of ["u_sam", "u_riley", "u_avery", "u_jordan", "u_quinn", "u_casey"]) {
      expect(can(user(id), "notes", "delete")).toBe(false);
    }
    expect(can(null, "notes", "read")).toBe(false);
    expect(can(user("u_sam"), "no_such_app", "read")).toBe(false);
  });

  it("allows only roles listed for the action", () => {
    expect(can(user("u_sam"), "notes", "create")).toBe(true);
    expect(can(user("u_casey"), "notes", "create")).toBe(false);
    expect(can(user("u_quinn"), "audit", "read")).toBe(true);
    expect(can(user("u_sam"), "audit", "read")).toBe(false);
  });
});

describe("mutate", () => {
  it("denies a role without permission and audits the denial", () => {
    const before = auditCount("notes");
    expect(() => createNote(user("u_jordan"))).toThrow(AccessDeniedError);
    const rows = listAuditEvents({ app: "notes" });
    expect(auditCount("notes")).toBe(before + 1);
    expect(rows[0]).toMatchObject({ actorId: "u_jordan", action: "create", outcome: "denied", beforeJson: null, afterJson: null });
    expect(db.select().from(notes).all()).toHaveLength(0);
  });

  it("writes exactly one audit row with the authorizing role and redacted PII", () => {
    const before = auditCount("notes");
    const note = createNote(user("u_sam"), "pat@example.com");
    expect(auditCount("notes")).toBe(before + 1);
    const row = listAuditEvents({ app: "notes", entityId: String(note.id) })[0];
    expect(row).toMatchObject({ actorId: "u_sam", actorRole: "support", action: "create", outcome: "ok", beforeJson: null });
    expect(row.requestId).toBeTruthy();
    const after = JSON.parse(row.afterJson!);
    expect(after.email).toBe(REDACTED);
    expect(after.title).toBe("hello");
    expect(row.afterJson).not.toContain("pat@example.com");
  });

  it("rejects invalid input before writing", () => {
    const before = auditCount("notes");
    expect(() =>
      mutate(user("u_sam"), {
        app: "notes",
        action: "create",
        schema: z.object({ title: z.string().min(1), email: z.string().email() }),
        input: { title: "", email: "not-an-email" },
        load: () => null,
        write: (tx, data) => tx.insert(notes).values(data).returning().get(),
      }),
    ).toThrow();
    expect(auditCount("notes")).toBe(before);
  });
});

describe("audit_events is append-only", () => {
  it("fails UPDATE", () => {
    createNote(user("u_sam"));
    expect(() => sqlite.prepare("UPDATE audit_events SET outcome = 'ok'").run()).toThrow(/append-only/);
  });

  it("fails DELETE", () => {
    expect(() => sqlite.prepare("DELETE FROM audit_events").run()).toThrow(/append-only/);
    expect(() => db.delete(auditEvents).run()).toThrow(/append-only/);
  });
});

describe("approvals", () => {
  function requestClose(requester: SessionUser) {
    const note = createNote(user("u_sam"));
    let approvalId = 0;
    mutate(requester, {
      app: "notes",
      action: "create",
      schema: z.object({ id: z.number() }),
      input: { id: note.id },
      load: (tx) => tx.select().from(notes).where(eq(notes.id, note.id)).get(),
      write: (tx, data) => {
        approvalId = requestApproval(tx, {
          app: "notes",
          entityId: String(data.id),
          action: "close",
          requestedBy: requester.id,
          requiredRole: "approver",
        }).id;
        return tx.select().from(notes).where(eq(notes.id, note.id)).get()!;
      },
    });
    return approvalId;
  }

  it("rejects self-approval even when the requester holds the required role", () => {
    const riley = user("u_riley");
    expect(riley.roles).toContain("approver");
    const approvalId = requestClose(riley);
    const before = auditCount("notes");
    expect(() => decide(riley, approvalId, "approved", "looks fine")).toThrow(/cannot decide/);
    expect(auditCount("notes")).toBe(before + 1);
    expect(listAuditEvents({ app: "notes" })[0]).toMatchObject({ actorId: "u_riley", action: "approval.approved", outcome: "denied" });
    expect(decide(user("u_avery"), approvalId, "approved", "ok").status).toBe("approved");
  });

  it("rejects a decider without the required role", () => {
    const approvalId = requestClose(user("u_sam"));
    expect(() => decide(user("u_casey"), approvalId, "approved", "admin says yes")).toThrow(/lacks role/);
    expect(listAuditEvents({ app: "notes" })[0]).toMatchObject({ actorId: "u_casey", outcome: "denied" });
  });

  it("fails when deciding twice", () => {
    const approvalId = requestClose(user("u_sam"));
    const avery = user("u_avery");
    const before = auditCount("notes");
    expect(decide(avery, approvalId, "rejected", "no").status).toBe("rejected");
    expect(auditCount("notes")).toBe(before + 1);
    expect(() => decide(avery, approvalId, "approved", "changed my mind")).toThrow(/no longer pending/);
    expect(() => decide(user("u_riley"), approvalId, "approved", "me too")).toThrow(/no longer pending/);
    // Each denied repeat decision is audited outside the rolled-back transaction.
    expect(auditCount("notes")).toBe(before + 3);
    const denied = listAuditEvents({ app: "notes", limit: 2 });
    expect(denied.every((r) => r.outcome === "denied")).toBe(true);
    expect(denied.map((r) => r.actorId)).toEqual(["u_riley", "u_avery"]);
  });
});
