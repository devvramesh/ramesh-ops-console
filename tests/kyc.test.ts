import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { kycCases } from "@/apps/kyc/schema";
import { claimCase, decideApproval, decideCase, getCase, KycError, listCases } from "@/apps/kyc/service";
import { createRefund, pendingApprovalFor } from "@/apps/refunds/service";
import { ApprovalError, getApproval, listApprovals, requestApproval } from "@/platform/approvals";
import { AccessDeniedError, listAuditEvents } from "@/platform/audit";
import { loadUser } from "@/platform/auth";
import { db } from "@/platform/db/client";
import { auditEvents } from "@/platform/db/schema";
import type { SessionUser } from "@/platform/rbac";
import { REDACTED } from "@/platform/redact";

const APP = "kyc";

function user(id: string): SessionUser {
  const u = loadUser(id);
  if (!u) throw new Error(`missing seeded user ${id}`);
  return u;
}

const sam = () => user("u_sam"); // support
const jordan = () => user("u_jordan"); // analyst
const morgan = () => user("u_morgan"); // analyst
const avery = () => user("u_avery"); // approver
const quinn = () => user("u_quinn"); // auditor
const casey = () => user("u_casey"); // admin

function auditCount() {
  return db.select({ n: sql<number>`count(*)` }).from(auditEvents).where(eq(auditEvents.app, APP)).get()!.n;
}

function latestAudit() {
  return listAuditEvents({ app: APP, limit: 1 })[0];
}

function raw(id: string) {
  return db.select().from(kycCases).where(eq(kycCases.id, id)).get()!;
}

function expectRedacted(json: string | null, row: { fullName: string; documentNumber: string }) {
  expect(json).toBeTruthy();
  const parsed = JSON.parse(json!) as Record<string, unknown>;
  expect(parsed.fullName).toBe(REDACTED);
  expect(parsed.documentNumber).toBe(REDACTED);
  expect(json).not.toContain(row.fullName);
  expect(json).not.toContain(row.documentNumber);
}

// Seeded cases used below. kyc_001..kyc_002 are left for tests/contract.test.ts (contractClaim takes the oldest new case).
// low: 005, 008, 010, 013, 015  medium: 003, 007, 011, 014  high: 004, 006, 009, 012

describe("kyc access", () => {
  it("denies support and audits the denial", () => {
    const before = auditCount();
    expect(() => claimCase(sam(), "kyc_005")).toThrow(AccessDeniedError);
    expect(auditCount()).toBe(before + 1);
    expect(latestAudit()).toMatchObject({ actorId: "u_sam", action: "claim", outcome: "denied", entityId: null });
    expect(raw("kyc_005").status).toBe("new");

    expect(() => listCases(sam())).toThrow(AccessDeniedError);
    expect(latestAudit()).toMatchObject({ actorId: "u_sam", action: "read", outcome: "denied" });
    expect(() => getCase(sam(), "kyc_005")).toThrow(AccessDeniedError);
    expect(auditCount()).toBe(before + 3);
  });

  it("lets analyst, approver, and auditor read; admin has no grant", () => {
    expect(listCases(jordan()).length).toBe(15);
    expect(listCases(avery()).length).toBe(15);
    expect(listCases(quinn()).length).toBe(15);
    expect(() => listCases(casey())).toThrow(AccessDeniedError);
  });
});

describe("claim", () => {
  it("moves a new case to in_review, assigns it, and writes one redacted audit row", () => {
    const before = auditCount();
    const after = claimCase(jordan(), "kyc_005");
    expect(after).toMatchObject({ id: "kyc_005", status: "in_review", assignee: "u_jordan" });
    expect(auditCount()).toBe(before + 1);
    const row = latestAudit();
    expect(row).toMatchObject({ actorId: "u_jordan", actorRole: "analyst", action: "claim", entityId: "kyc_005", outcome: "ok" });
    expectRedacted(row.beforeJson, after);
    expectRedacted(row.afterJson, after);
    expect(JSON.parse(row.beforeJson!).status).toBe("new");
    expect(JSON.parse(row.afterJson!).status).toBe("in_review");
  });

  it("refuses to claim a case that is not new and writes no audit row", () => {
    const before = auditCount();
    expect(() => claimCase(morgan(), "kyc_005")).toThrow(KycError);
    expect(auditCount()).toBe(before);
    expect(raw("kyc_005").assignee).toBe("u_jordan");
  });
});

describe("analyst decision", () => {
  it("rejects an empty note without writing", () => {
    const before = auditCount();
    expect(() => decideCase(jordan(), "kyc_005", "approved", "")).toThrow(ZodError);
    expect(() => decideCase(jordan(), "kyc_005", "approved", "   ")).toThrow(ZodError);
    expect(auditCount()).toBe(before);
    expect(raw("kyc_005").status).toBe("in_review");
  });

  it("only the assignee can decide; another analyst is denied and audited", () => {
    const before = auditCount();
    expect(() => decideCase(morgan(), "kyc_005", "approved", "looks fine")).toThrow(AccessDeniedError);
    expect(auditCount()).toBe(before + 1);
    expect(latestAudit()).toMatchObject({ actorId: "u_morgan", action: "approve", entityId: "kyc_005", outcome: "denied" });
    expect(raw("kyc_005").status).toBe("in_review");
  });

  it("approves a low-risk case directly with one redacted audit row", () => {
    const before = auditCount();
    const after = decideCase(jordan(), "kyc_005", "approved", "documents match");
    expect(after).toMatchObject({ status: "approved", decisionNote: "documents match" });
    expect(auditCount()).toBe(before + 1);
    const row = latestAudit();
    expect(row).toMatchObject({ actorId: "u_jordan", action: "approve", entityId: "kyc_005", outcome: "ok" });
    expectRedacted(row.beforeJson, after);
    expectRedacted(row.afterJson, after);
    expect(listApprovals({ app: APP, entityId: "kyc_005" })).toEqual([]);
  });

  it("approves a medium-risk case without an approval", () => {
    claimCase(jordan(), "kyc_003");
    expect(decideCase(jordan(), "kyc_003", "approved", "ok").status).toBe("approved");
    expect(listApprovals({ app: APP, entityId: "kyc_003" })).toEqual([]);
  });

  it("rejects a case with a note and one redacted audit row", () => {
    claimCase(morgan(), "kyc_008");
    const before = auditCount();
    const after = decideCase(morgan(), "kyc_008", "rejected", "document expired");
    expect(after).toMatchObject({ status: "rejected", decisionNote: "document expired", assignee: "u_morgan" });
    expect(auditCount()).toBe(before + 1);
    const row = latestAudit();
    expect(row).toMatchObject({ actorId: "u_morgan", action: "reject", outcome: "ok" });
    expectRedacted(row.afterJson, after);
  });

  it("will not decide a case that is already decided", () => {
    expect(() => decideCase(jordan(), "kyc_005", "rejected", "changed my mind")).toThrow(KycError);
    expect(raw("kyc_005").status).toBe("approved");
  });
});

describe("high-risk approval", () => {
  function requestHighRisk(id: string, requester: SessionUser) {
    claimCase(requester, id);
    const before = auditCount();
    const after = decideCase(requester, id, "approved", "enhanced due diligence complete");
    expect(after.status).toBe("in_review");
    expect(auditCount()).toBe(before + 1);
    const pending = listApprovals({ app: APP, entityId: id, status: "pending" });
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ requestedBy: requester.id, requiredRole: "approver", action: "approve" });
    return pending[0].id;
  }

  it("approving a high-risk case opens a pending approval and keeps the case in_review", () => {
    const approvalId = requestHighRisk("kyc_004", jordan());
    expect(() => decideCase(jordan(), "kyc_004", "approved", "again")).toThrow(/pending approval/);
    expect(approvalId).toBeGreaterThan(0);
  });

  it("rejects self-approval even when the requester holds the approver role", () => {
    const requester: SessionUser = { ...jordan(), roles: ["analyst", "approver"] };
    const approvalId = requestHighRisk("kyc_006", requester);
    const before = auditCount();
    expect(() => decideApproval(requester, approvalId, "approved", "I approve myself")).toThrow(/cannot decide/);
    expect(auditCount()).toBe(before + 1);
    expect(latestAudit()).toMatchObject({ actorId: "u_jordan", action: "approval.approved", entityId: "kyc_006", outcome: "denied" });
    expect(raw("kyc_006").status).toBe("in_review");
  });

  it("rejects a decider without the approver role", () => {
    const approvalId = listApprovals({ app: APP, entityId: "kyc_004", status: "pending" })[0].id;
    for (const u of [morgan(), casey(), quinn()]) {
      expect(() => decideApproval(u, approvalId, "approved", "yes")).toThrow(ApprovalError);
      expect(latestAudit()).toMatchObject({ actorId: u.id, action: "approval.approved", outcome: "denied" });
    }
    expect(raw("kyc_004").status).toBe("in_review");
  });

  it("requires a non-empty approver note", () => {
    const approvalId = listApprovals({ app: APP, entityId: "kyc_004", status: "pending" })[0].id;
    expect(() => decideApproval(avery(), approvalId, "approved", " ")).toThrow(ZodError);
    expect(raw("kyc_004").status).toBe("in_review");
  });

  it("an approver decides it, the case becomes approved, and deciding twice fails", () => {
    const approvalId = listApprovals({ app: APP, entityId: "kyc_004", status: "pending" })[0].id;
    const before = auditCount();
    const decided = decideApproval(avery(), approvalId, "approved", "verified");
    expect(decided).toMatchObject({ status: "approved", decidedBy: "u_avery", note: "verified" });
    expect(raw("kyc_004").status).toBe("approved");
    expect(auditCount()).toBe(before + 1);
    expect(latestAudit()).toMatchObject({ actorId: "u_avery", actorRole: "approver", action: "approval.approved", entityId: "kyc_004", outcome: "ok" });

    expect(() => decideApproval(avery(), approvalId, "rejected", "undo")).toThrow(/no longer pending/);
    expect(() => decideApproval(user("u_riley"), approvalId, "approved", "me too")).toThrow(/no longer pending/);
    // Each denied repeat decision is audited outside the rolled-back transaction.
    expect(auditCount()).toBe(before + 3);
    expect(listAuditEvents({ app: APP, limit: 2 }).every((r) => r.outcome === "denied")).toBe(true);
    expect(raw("kyc_004").status).toBe("approved");
  });

  it("audits a decision attempt on a refunds approval", () => {
    // A refunds approval probed through the KYC path is denied and audited under refunds.
    const refund = createRefund(sam(), { customerRef: "cus_probe", customerEmail: "probe@example.com", amountCents: 60000, currency: "USD", reason: "probe" });
    const approval = pendingApprovalFor(refund.id)!;
    const deniedBefore = listAuditEvents({ app: "refunds" }).filter((r) => r.outcome === "denied").length;
    expect(() => decideApproval(avery(), approval.id, "approved", "wrong app")).toThrow(KycError);
    const denied = listAuditEvents({ app: "refunds" }).filter((r) => r.outcome === "denied");
    expect(denied.length).toBe(deniedBefore + 1);
    expect(denied[0]).toMatchObject({ actorId: "u_avery", action: "approval.approved", entityId: refund.id, outcome: "denied" });
    expect(getApproval(approval.id)!.status).toBe("pending");
  });

  it.each(["missing_case", "kyc_005"])("rolls back the approval if case %s is missing or no longer in_review", (entityId) => {
    const approval = db.transaction((tx) => requestApproval(tx, {
      app: APP, entityId, action: "approve", requestedBy: "u_jordan", requiredRole: "approver",
    }));
    const before = auditCount();
    const caseBefore = raw(entityId);
    expect(() => decideApproval(avery(), approval.id, "approved", "verified")).toThrow(/not in_review/);
    expect(getApproval(approval.id)).toEqual(approval);
    expect(raw(entityId)).toEqual(caseBefore);
    expect(auditCount()).toBe(before);
  });

  it("a rejected approval leaves the case in_review so the analyst can reject it", () => {
    const approvalId = listApprovals({ app: APP, entityId: "kyc_006", status: "pending" })[0].id;
    expect(decideApproval(avery(), approvalId, "rejected", "source of funds unclear").status).toBe("rejected");
    expect(raw("kyc_006").status).toBe("in_review");
    expect(decideCase(jordan(), "kyc_006", "rejected", "approver declined").status).toBe("rejected");
  });
});
