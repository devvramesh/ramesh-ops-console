import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { featureFlags } from "@/apps/flags/schema";
import {
  createFlag,
  decideFlagApproval,
  disableFlag,
  enableFlag,
  FlagError,
  getFlag,
  listFlags,
  pendingFlagIds,
} from "@/apps/flags/service";
import { ApprovalError, listApprovals } from "@/platform/approvals";
import { AccessDeniedError, listAuditEvents } from "@/platform/audit";
import { loadUser } from "@/platform/auth";
import { db } from "@/platform/db/client";
import { auditEvents } from "@/platform/db/schema";
import type { SessionUser } from "@/platform/rbac";
import { REDACTED } from "@/platform/redact";

const APP = "flags";

function user(id: string): SessionUser {
  const u = loadUser(id);
  if (!u) throw new Error(`missing seeded user ${id}`);
  return u;
}

const sam = () => user("u_sam"); // support
const jordan = () => user("u_jordan"); // analyst
const avery = () => user("u_avery"); // approver
const riley = () => user("u_riley"); // support + approver
const quinn = () => user("u_quinn"); // auditor
const casey = () => user("u_casey"); // admin

function auditCount() {
  return db.select({ n: sql<number>`count(*)` }).from(auditEvents).where(eq(auditEvents.app, APP)).get()!.n;
}

function latestAudit() {
  return listAuditEvents({ app: APP, limit: 1 })[0];
}

function raw(id: string) {
  return db.select().from(featureFlags).where(eq(featureFlags.id, id)).get()!;
}

function pendingFor(id: string) {
  return listApprovals({ app: APP, entityId: id, status: "pending" })[0];
}

function expectOwnerNoteRedacted(json: string | null, ownerNote: string | null) {
  expect(json).toBeTruthy();
  const parsed = JSON.parse(json!) as Record<string, unknown>;
  if (ownerNote) {
    expect(parsed.ownerNote).toBe(REDACTED);
    expect(json).not.toContain(ownerNote);
  }
}

// Seeded flags. low: 001 on, 002 off, 003 on, 004 off. high: 005 off, 006 off, 007 on, 008 on.

describe("flags access", () => {
  it("denies support and analyst every read and write, and audits each denial", () => {
    for (const u of [sam(), jordan()]) {
      const before = auditCount();
      expect(() => listFlags(u)).toThrow(AccessDeniedError);
      expect(latestAudit()).toMatchObject({ actorId: u.id, action: "read", outcome: "denied" });
      expect(() => getFlag(u, "flg_001")).toThrow(AccessDeniedError);
      expect(() => disableFlag(u, "flg_001")).toThrow(AccessDeniedError);
      expect(latestAudit()).toMatchObject({ actorId: u.id, action: "disable", outcome: "denied" });
      expect(() => enableFlag(u, "flg_002")).toThrow(AccessDeniedError);
      expect(() => createFlag(u, { key: "nope", description: "x", risk: "low" })).toThrow(AccessDeniedError);
      expect(auditCount()).toBe(before + 5);
    }
    expect(raw("flg_001").enabled).toBe(true);
    expect(raw("flg_002").enabled).toBe(false);
  });

  it("lets auditor and approver read but not write", () => {
    expect(listFlags(quinn()).length).toBeGreaterThanOrEqual(8);
    expect(listFlags(avery()).length).toBeGreaterThanOrEqual(8);
    expect(() => disableFlag(quinn(), "flg_001")).toThrow(AccessDeniedError);
    expect(() => enableFlag(avery(), "flg_002")).toThrow(AccessDeniedError);
    expect(latestAudit()).toMatchObject({ actorId: "u_avery", action: "enable", outcome: "denied" });
  });
});

describe("create", () => {
  it("creates an off flag with one audit row and the owner note redacted", () => {
    const before = auditCount();
    const flag = createFlag(casey(), {
      key: "test_created_flag",
      description: "created in a test",
      risk: "high",
      ownerNote: "Owned by Taylor Brooks",
    });
    expect(flag).toMatchObject({ key: "test_created_flag", enabled: false, risk: "high", createdBy: "u_casey" });
    expect(auditCount()).toBe(before + 1);
    const row = latestAudit();
    expect(row).toMatchObject({ actorId: "u_casey", actorRole: "admin", action: "create", outcome: "ok", entityId: flag.id });
    expect(row.beforeJson).toBeNull();
    expectOwnerNoteRedacted(row.afterJson, "Owned by Taylor Brooks");
  });

  it("rejects a duplicate key and an invalid key without an audit row", () => {
    const before = auditCount();
    expect(() => createFlag(casey(), { key: "dark_mode", description: "dup", risk: "low" })).toThrow(FlagError);
    expect(() => createFlag(casey(), { key: "Bad Key", description: "x", risk: "low" })).toThrow(ZodError);
    expect(() => createFlag(casey(), { key: "ok_key", description: "x", risk: "medium" as "low" })).toThrow(ZodError);
    expect(auditCount()).toBe(before);
  });
});

describe("kill switch", () => {
  it("turns a high-risk flag off immediately with one redacted audit row and no approval", () => {
    const before = auditCount();
    const seeded = raw("flg_008");
    const after = disableFlag(casey(), "flg_008");
    expect(after.enabled).toBe(false);
    expect(auditCount()).toBe(before + 1);
    const row = latestAudit();
    expect(row).toMatchObject({ actorId: "u_casey", action: "disable", outcome: "ok", entityId: "flg_008" });
    expect(JSON.parse(row.beforeJson!).enabled).toBe(true);
    expect(JSON.parse(row.afterJson!).enabled).toBe(false);
    expectOwnerNoteRedacted(row.beforeJson, seeded.ownerNote);
    expectOwnerNoteRedacted(row.afterJson, seeded.ownerNote);
    expect(listApprovals({ app: APP, entityId: "flg_008" })).toEqual([]);
  });

  it("turns a low-risk flag off and refuses a flag that is already off", () => {
    expect(disableFlag(casey(), "flg_003").enabled).toBe(false);
    expect(() => disableFlag(casey(), "flg_003")).toThrow(FlagError);
  });
});

describe("enable", () => {
  it("turns a low-risk flag on immediately with one audit row and no approval", () => {
    const before = auditCount();
    const after = enableFlag(casey(), "flg_002");
    expect(after.enabled).toBe(true);
    expect(auditCount()).toBe(before + 1);
    expect(latestAudit()).toMatchObject({ actorId: "u_casey", action: "enable", outcome: "ok", entityId: "flg_002" });
    expect(listApprovals({ app: APP, entityId: "flg_002" })).toEqual([]);
    expect(() => enableFlag(casey(), "flg_002")).toThrow(FlagError);
  });

  it("leaves a high-risk flag off and opens one approval for an approver", () => {
    const before = auditCount();
    const after = enableFlag(casey(), "flg_005");
    expect(after.enabled).toBe(false);
    expect(auditCount()).toBe(before + 1);
    expect(latestAudit()).toMatchObject({ actorId: "u_casey", action: "enable", outcome: "ok", entityId: "flg_005" });
    expect(pendingFor("flg_005")).toMatchObject({ requestedBy: "u_casey", requiredRole: "approver", action: "enable" });
    expect(pendingFlagIds(quinn()).has("flg_005")).toBe(true);
    expect(() => enableFlag(casey(), "flg_005")).toThrow(/pending enable request/);
    expect(listApprovals({ app: APP, entityId: "flg_005" })).toHaveLength(1);
  });
});

describe("high-risk approval", () => {
  it("rejects self-approval even when the requester holds the approver role", () => {
    const adminApprover: SessionUser = { ...casey(), roles: ["admin", "approver"] };
    enableFlag(adminApprover, "flg_006");
    const approval = pendingFor("flg_006");
    expect(approval.requestedBy).toBe("u_casey");
    const before = auditCount();
    expect(() => decideFlagApproval(adminApprover, approval.id, "approved", "self")).toThrow(/cannot decide/);
    expect(auditCount()).toBe(before + 1);
    expect(latestAudit()).toMatchObject({ actorId: "u_casey", action: "approval.approved", outcome: "denied" });
    expect(raw("flg_006").enabled).toBe(false);
  });

  it("rejects deciders without the approver role", () => {
    const approval = pendingFor("flg_005");
    for (const u of [quinn(), sam(), jordan()]) {
      expect(() => decideFlagApproval(u, approval.id, "approved", "yes")).toThrow(ApprovalError);
    }
    expect(() => decideFlagApproval(avery(), approval.id, "approved", "  ")).toThrow(ZodError);
    expect(raw("flg_005").enabled).toBe(false);
    expect(pendingFor("flg_005")?.id).toBe(approval.id);
  });

  it("turns the flag on when an approver approves, and a second decision fails", () => {
    const approval = pendingFor("flg_005");
    const before = auditCount();
    const decided = decideFlagApproval(avery(), approval.id, "approved", "rollout reviewed");
    expect(decided).toMatchObject({ status: "approved", decidedBy: "u_avery" });
    expect(raw("flg_005").enabled).toBe(true);
    expect(auditCount()).toBe(before + 1);
    expect(latestAudit()).toMatchObject({ actorId: "u_avery", action: "approval.approved", outcome: "ok", entityId: "flg_005" });

    expect(() => decideFlagApproval(riley(), approval.id, "rejected", "too late")).toThrow(/no longer pending/);
    expect(latestAudit()).toMatchObject({ actorId: "u_riley", action: "approval.rejected", outcome: "denied" });
    expect(raw("flg_005").enabled).toBe(true);
  });

  it("leaves the flag off when an approver rejects, and the admin can request again", () => {
    const approval = pendingFor("flg_006");
    decideFlagApproval(riley(), approval.id, "rejected", "not this week");
    expect(raw("flg_006").enabled).toBe(false);
    expect(pendingFor("flg_006")).toBeUndefined();
    enableFlag(casey(), "flg_006");
    expect(pendingFor("flg_006")).toBeTruthy();
  });

  it("refuses an approval id that belongs to another app", () => {
    const other = listApprovals({ status: "pending" }).find((a) => a.app !== APP);
    if (!other) return;
    expect(() => decideFlagApproval(avery(), other.id, "approved", "probe")).toThrow(FlagError);
  });
});
