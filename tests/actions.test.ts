import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { decideApprovalAction, decideCaseAction } from "@/apps/kyc/actions";
import { kycCases } from "@/apps/kyc/schema";
import { claimCase, decideCase } from "@/apps/kyc/service";
import { decideRefundAction } from "@/apps/refunds/actions";
import { refunds } from "@/apps/refunds/schema";
import { createRefund, pendingApprovalFor } from "@/apps/refunds/service";
import { approvals, listApprovals } from "@/platform/approvals";
import { getSession, loadUser } from "@/platform/auth";
import { db } from "@/platform/db/client";
import { auditEvents } from "@/platform/db/schema";

vi.mock("@/platform/auth", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/platform/auth")>(),
  getSession: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error(`redirect:${url}`); },
}));

const caseIds: string[] = [];

function newCase(riskTier: "low" | "high") {
  const id = `kyc_action_${caseIds.length}`;
  caseIds.push(id);
  const now = new Date().toISOString();
  db.insert(kycCases).values({
    id, subjectRef: id, fullName: "Synthetic Subject", documentNumber: "SYNTHETIC-123",
    riskTier, createdAt: now, updatedAt: now,
  }).run();
  claimCase(loadUser("u_jordan")!, id);
  return id;
}

function snapshot() {
  return {
    cases: db.select().from(kycCases).all(),
    refunds: db.select().from(refunds).all(),
    approvals: db.select().from(approvals).all(),
    audit: db.select().from(auditEvents).all(),
  };
}

afterAll(() => {
  for (const id of caseIds) db.delete(kycCases).where(eq(kycCases.id, id)).run();
});

describe("decision actions fail closed", () => {
  it("rejects an unknown refund decision without changing anything", async () => {
    const refund = createRefund(loadUser("u_sam")!, {
      customerRef: "cus_action", customerEmail: "action@example.com", amountCents: 75000, currency: "USD", reason: "action test",
    });
    vi.mocked(getSession).mockResolvedValue(loadUser("u_avery"));
    const form = new FormData();
    form.set("refundId", refund.id);
    form.set("approvalId", String(pendingApprovalFor(refund.id)!.id));
    form.set("decision", "unknown");
    form.set("note", "valid note");
    const before = snapshot();
    await expect(decideRefundAction(form)).rejects.toThrow(/error=Invalid%20decision/);
    expect(snapshot()).toEqual(before);
  });

  it("rejects an unknown analyst decision without changing anything", async () => {
    const id = newCase("low");
    vi.mocked(getSession).mockResolvedValue(loadUser("u_jordan"));
    const form = new FormData();
    form.set("id", id);
    form.set("decision", "unknown");
    form.set("note", "valid note");
    const before = snapshot();
    await expect(decideCaseAction(form)).rejects.toThrow(/error=Invalid%20decision/);
    expect(snapshot()).toEqual(before);
  });

  it("rejects an unknown KYC approval decision without changing anything", async () => {
    const id = newCase("high");
    decideCase(loadUser("u_jordan")!, id, "approved", "due diligence complete");
    vi.mocked(getSession).mockResolvedValue(loadUser("u_avery"));
    const form = new FormData();
    form.set("id", id);
    form.set("approvalId", String(listApprovals({ app: "kyc", entityId: id, status: "pending" })[0].id));
    form.set("decision", "unknown");
    form.set("note", "valid note");
    const before = snapshot();
    await expect(decideApprovalAction(form)).rejects.toThrow(/error=Invalid%20decision/);
    expect(snapshot()).toEqual(before);
  });
});
