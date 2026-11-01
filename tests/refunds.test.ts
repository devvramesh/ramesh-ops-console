import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { claimCase, decideCase } from "@/apps/kyc/service";
import {
  createRefund,
  currentMonth,
  decideRefund,
  dollarsToCents,
  EXPORT_COLUMNS,
  exportRefundsCsv,
  getRefund,
  listRefunds,
  payRefund,
  pendingApprovalFor,
} from "@/apps/refunds/service";
import { ApprovalError, getApproval, listApprovals } from "@/platform/approvals";
import { AccessDeniedError, listAuditEvents } from "@/platform/audit";
import { loadUser } from "@/platform/auth";
import { db } from "@/platform/db/client";
import { auditEvents } from "@/platform/db/schema";
import type { SessionUser } from "@/platform/rbac";
import { REDACTED } from "@/platform/redact";

const EMAIL = "pat.customer@example.com";

function user(id: string): SessionUser {
  const u = loadUser(id);
  if (!u) throw new Error(`missing seeded user ${id}`);
  return u;
}

function auditCount() {
  return db.select({ n: sql<number>`count(*)` }).from(auditEvents).where(eq(auditEvents.app, "refunds")).get()!.n;
}

function create(actor: SessionUser, amountCents: number) {
  return createRefund(actor, { customerRef: "cus_test", customerEmail: EMAIL, amountCents, currency: "USD", reasonCode: "service_issue", reason: "test" });
}

function expectRedacted(rows: ReturnType<typeof listAuditEvents>) {
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) {
    for (const blob of [row.beforeJson, row.afterJson]) {
      if (!blob) continue;
      expect(blob).not.toContain(EMAIL);
      const parsed = JSON.parse(blob) as Record<string, unknown>;
      if ("customerEmail" in parsed) expect(parsed.customerEmail).toBe(REDACTED);
    }
  }
}

describe("threshold", () => {
  it("auto-approves at 50000 cents and audits refund.auto_approved with the threshold", () => {
    const before = auditCount();
    const refund = create(user("u_sam"), 50000);
    expect(refund.status).toBe("approved");
    expect(pendingApprovalFor(refund.id)).toBeUndefined();
    expect(auditCount()).toBe(before + 2);
    const rows = listAuditEvents({ app: "refunds", entityId: refund.id });
    expect(rows.map((r) => r.action).sort()).toEqual(["create", "refund.auto_approved"]);
    const auto = rows.find((r) => r.action === "refund.auto_approved")!;
    expect(auto.beforeJson).toBeNull();
    expect(JSON.parse(auto.afterJson!)).toMatchObject({ status: "approved", thresholdCents: 50000, amountCents: 50000 });
    expect(auto.actorRole).toBe("support");
    expectRedacted(rows);
  });

  it("requests approval at 50001 cents", () => {
    const before = auditCount();
    const refund = create(user("u_sam"), 50001);
    expect(refund.status).toBe("pending_approval");
    const approval = pendingApprovalFor(refund.id)!;
    expect(approval).toMatchObject({ requestedBy: "u_sam", requiredRole: "approver", status: "pending" });
    expect(auditCount()).toBe(before + 1);
    expect(listAuditEvents({ app: "refunds", entityId: refund.id }).map((r) => r.action)).toEqual(["create"]);
  });

  it("rejects amounts that are not positive integers, too large, or not USD", () => {
    const before = auditCount();
    expect(() => create(user("u_sam"), 0)).toThrow();
    expect(() => create(user("u_sam"), 12.5)).toThrow();
    expect(() => create(user("u_sam"), 10000001)).toThrow();
    expect(() =>
      createRefund(user("u_sam"), { customerRef: "cus_x", customerEmail: EMAIL, amountCents: 100, currency: "EUR" as "USD", reasonCode: "goodwill", reason: "x" }),
    ).toThrow();
    expect(auditCount()).toBe(before);
  });

  it("parses dollars to cents without floats", () => {
    expect(dollarsToCents("600")).toBe(60000);
    expect(dollarsToCents("600.5")).toBe(60050);
    expect(dollarsToCents("$0.07")).toBe(7);
    expect(dollarsToCents("1.234")).toBeNull();
    expect(dollarsToCents("abc")).toBeNull();
  });
});

describe("permissions", () => {
  it("support cannot approve and the denial is audited", () => {
    const refund = create(user("u_sam"), 60000);
    const approval = pendingApprovalFor(refund.id)!;
    const before = auditCount();
    expect(() => decideRefund(user("u_sam"), approval.id, "approved", "me")).toThrow(AccessDeniedError);
    expect(auditCount()).toBe(before + 1);
    expect(listAuditEvents({ app: "refunds" })[0]).toMatchObject({ actorId: "u_sam", action: "approve", entityId: refund.id, outcome: "denied" });
    expect(getRefund(user("u_quinn"), refund.id)?.status).toBe("pending_approval");
  });

  it("Riley cannot approve a refund Riley created", () => {
    const riley = user("u_riley");
    expect(riley.roles).toEqual(expect.arrayContaining(["support", "approver"]));
    const refund = create(riley, 60000);
    const approval = pendingApprovalFor(refund.id)!;
    const before = auditCount();
    expect(() => decideRefund(riley, approval.id, "approved", "self")).toThrow(/cannot decide/);
    expect(auditCount()).toBe(before + 1);
    expect(listAuditEvents({ app: "refunds" })[0]).toMatchObject({ actorId: "u_riley", action: "approval.approved", outcome: "denied" });
    expect(getRefund(riley, refund.id)?.status).toBe("pending_approval");
    expect(decideRefund(user("u_avery"), approval.id, "approved", "ok").status).toBe("approved");
    expect(getRefund(riley, refund.id)?.status).toBe("approved");
  });

  it("analyst is denied read and create, and each denial is audited", () => {
    const jordan = user("u_jordan");
    const before = auditCount();
    expect(() => listRefunds(jordan)).toThrow(AccessDeniedError);
    expect(() => create(jordan, 100)).toThrow(AccessDeniedError);
    expect(auditCount()).toBe(before + 2);
    const [created, read] = listAuditEvents({ app: "refunds", limit: 2 });
    expect(created).toMatchObject({ actorId: "u_jordan", action: "create", outcome: "denied", afterJson: null });
    expect(read).toMatchObject({ actorId: "u_jordan", action: "read", outcome: "denied" });
  });

  it("only admin can pay, and only approved refunds", async () => {
    const refund = create(user("u_sam"), 60000);
    await expect(payRefund(user("u_sam"), refund.id)).rejects.toThrow(AccessDeniedError);
    expect(listAuditEvents({ app: "refunds" })[0]).toMatchObject({ actorId: "u_sam", action: "pay", outcome: "denied" });
    await expect(payRefund(user("u_casey"), refund.id)).rejects.toThrow(/not approved/);
  });
});

describe("decisions", () => {
  it("deciding twice fails", () => {
    const refund = create(user("u_sam"), 70000);
    const approval = pendingApprovalFor(refund.id)!;
    const avery = user("u_avery");
    const before = auditCount();
    expect(decideRefund(avery, approval.id, "rejected", "no").status).toBe("rejected");
    expect(auditCount()).toBe(before + 1);
    expect(() => decideRefund(avery, approval.id, "approved", "changed my mind")).toThrow(/no longer pending/);
    expect(() => decideRefund(user("u_riley"), approval.id, "approved", "me too")).toThrow(ApprovalError);
    // Each denied repeat decision is audited outside the rolled-back transaction.
    expect(auditCount()).toBe(before + 3);
    expect(listAuditEvents({ app: "refunds", limit: 2 }).every((r) => r.outcome === "denied")).toBe(true);
    expect(getRefund(avery, refund.id)?.status).toBe("rejected");
  });

  it("audits a decision attempt on another app's approval", () => {
    // A high-risk case approval probed through the refunds path is denied and audited under kyc.
    claimCase(user("u_jordan"), "kyc_012");
    decideCase(user("u_jordan"), "kyc_012", "approved", "looks fine");
    const kycApproval = listApprovals({ app: "kyc", entityId: "kyc_012", status: "pending" })[0];
    const deniedBefore = listAuditEvents({ app: "kyc" }).filter((r) => r.outcome === "denied").length;
    expect(() => decideRefund(user("u_avery"), kycApproval.id, "approved", "wrong app")).toThrow(ApprovalError);
    const denied = listAuditEvents({ app: "kyc" }).filter((r) => r.outcome === "denied");
    expect(denied.length).toBe(deniedBefore + 1);
    expect(denied[0]).toMatchObject({ actorId: "u_avery", action: "approval.approved", entityId: "kyc_012", outcome: "denied" });
    expect(getApproval(kycApproval.id)!.status).toBe("pending");
  });

  it("every transition writes an audit row with customer_email redacted", async () => {
    const start = auditCount();
    const refund = create(user("u_sam"), 60000);
    const approval = pendingApprovalFor(refund.id)!;
    decideRefund(user("u_avery"), approval.id, "approved", "fine");
    const paid = await payRefund(user("u_casey"), refund.id);
    expect(paid.status).toBe("paid");
    expect(paid.processorRef).toMatch(/^fake_/);
    expect(auditCount()).toBe(start + 3);

    const rows = listAuditEvents({ app: "refunds", entityId: refund.id });
    expect(rows.map((r) => r.action)).toEqual(["pay", "approval.approved", "create"]);
    expect(rows.every((r) => r.outcome === "ok")).toBe(true);
    expectRedacted(rows);

    const pay = rows[0];
    expect(JSON.parse(pay.beforeJson!)).toMatchObject({ status: "approved", customerEmail: REDACTED });
    expect(JSON.parse(pay.afterJson!)).toMatchObject({ status: "paid", processorRef: paid.processorRef, customerEmail: REDACTED });

    const small = create(user("u_sam"), 500);
    const paidSmall = await payRefund(user("u_casey"), small.id);
    expect(paidSmall.status).toBe("paid");
    expectRedacted(listAuditEvents({ app: "refunds", entityId: small.id }));
  });

  it("paying twice is refused and the processor reference is stable", async () => {
    const refund = create(user("u_sam"), 100);
    const paid = await payRefund(user("u_casey"), refund.id);
    await expect(payRefund(user("u_casey"), refund.id)).rejects.toThrow(/not approved/);
    expect(getRefund(user("u_casey"), refund.id)?.processorRef).toBe(paid.processorRef);
  });
});

describe("refundSummary", () => {
  it("counts refunds created this month and pending approvals, and averages decision time", async () => {
    const { refundSummary } = await import("@/apps/refunds/service");
    const before = refundSummary(user("u_sam"));

    const refund = create(user("u_sam"), 60000);
    const pending = refundSummary(user("u_sam"));
    expect(pending.refundsThisMonth).toBe(before.refundsThisMonth + 1);
    expect(pending.pendingApprovals).toBe(before.pendingApprovals + 1);

    const approval = pendingApprovalFor(refund.id)!;
    decideRefund(user("u_avery"), approval.id, "approved", "ok");
    const after = refundSummary(user("u_sam"));
    expect(after.pendingApprovals).toBe(before.pendingApprovals);
    expect(after.avgApprovalMs).not.toBeNull();
    expect(after.avgApprovalMs!).toBeGreaterThanOrEqual(0);
  });

  it("denies users without refunds read", async () => {
    const { refundSummary } = await import("@/apps/refunds/service");
    expect(() => refundSummary(user("u_jordan"))).toThrow(AccessDeniedError);
    expect(listAuditEvents({ app: "refunds" })[0]).toMatchObject({ actorId: "u_jordan", outcome: "denied" });
  });
});

describe("reason code", () => {
  it("is stored on create and rejects a missing or unknown code without writing", () => {
    const refund = create(user("u_sam"), 1200);
    expect(refund.reasonCode).toBe("service_issue");
    const before = auditCount();
    const base = { customerRef: "cus_rc", customerEmail: EMAIL, amountCents: 1200, currency: "USD" as const, reason: "x" };
    expect(() => createRefund(user("u_sam"), { ...base, reasonCode: "other" as "fraud" })).toThrow();
    expect(() => createRefund(user("u_sam"), { ...base } as Parameters<typeof createRefund>[1])).toThrow();
    expect(auditCount()).toBe(before);
  });
});

describe("exportRefundsCsv", () => {
  const exportRows = () => listAuditEvents({ app: "refunds" }).filter((r) => r.action === "export");

  it.each([
    ["u_avery", "approver"],
    ["u_casey", "admin"],
  ])("lets %s export and writes one PII-free audit row", (userId, role) => {
    create(user("u_sam"), 2500);
    const before = exportRows().length;
    const month = currentMonth();
    const { csv, filename, rowCount } = exportRefundsCsv(user(userId), month);

    expect(filename).toBe(`refunds-${month}.csv`);
    const lines = csv.trimEnd().split("\r\n");
    expect(lines[0]).toBe(EXPORT_COLUMNS.join(","));
    expect(lines).toHaveLength(rowCount + 1);
    expect(rowCount).toBeGreaterThan(0);
    for (const line of lines.slice(1)) expect(line).toMatch(/,(duplicate_charge|fraud|service_issue|goodwill),\d+,USD,/);
    expect(csv).not.toContain("@");
    expect(csv).not.toContain("cus_");
    expect(csv).not.toContain(EMAIL);

    const rows = exportRows();
    expect(rows).toHaveLength(before + 1);
    expect(rows[0]).toMatchObject({ actorId: userId, actorRole: role, outcome: "ok", entityId: null, beforeJson: null });
    expect(JSON.parse(rows[0].afterJson!)).toEqual({ month, rowCount, columns: [...EXPORT_COLUMNS] });
  });

  it("returns only refunds created in the requested UTC month", () => {
    const { csv, rowCount } = exportRefundsCsv(user("u_avery"), "2000-01");
    expect(rowCount).toBe(0);
    expect(csv).toBe(EXPORT_COLUMNS.join(",") + "\r\n");
  });

  it.each([["u_sam"], ["u_quinn"], ["u_jordan"]])("denies %s and audits the denial", (userId) => {
    const before = exportRows();
    expect(() => exportRefundsCsv(user(userId), currentMonth())).toThrow(AccessDeniedError);
    const after = exportRows();
    expect(after).toHaveLength(before.length + 1);
    expect(after[0]).toMatchObject({ actorId: userId, outcome: "denied", afterJson: null });
  });

  it("denies an anonymous export and audits it", () => {
    expect(() => exportRefundsCsv(null, currentMonth())).toThrow(AccessDeniedError);
    expect(exportRows()[0]).toMatchObject({ actorId: "anonymous", outcome: "denied" });
  });

  it("rejects a malformed month without writing an ok row", () => {
    const before = exportRows().length;
    expect(() => exportRefundsCsv(user("u_avery"), "2026-13")).toThrow();
    expect(() => exportRefundsCsv(user("u_avery"), "2026-1")).toThrow();
    expect(exportRows()).toHaveLength(before);
  });
});
