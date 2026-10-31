import { eq } from "drizzle-orm";
import { isValidElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import KycCasePage from "@/app/kyc/[id]/page";
import { kycCases } from "@/apps/kyc/schema";
import { listAuditEvents } from "@/platform/audit";
import { getSession, loadUser } from "@/platform/auth";
import { db } from "@/platform/db/client";

vi.mock("@/platform/auth", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/platform/auth")>(),
  getSession: vi.fn(),
}));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("not found"); } }));

function textContent(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textContent).join(" ");
  if (isValidElement<{ children?: ReactNode }>(node)) return textContent(node.props.children);
  return "";
}

describe("KYC detail read auditing", () => {
  it.each([
    ["u_jordan", "analyst"], ["u_avery", "approver"], ["u_quinn", "auditor"],
  ])("records exactly one PII-free read per detail load by %s", async (userId, role) => {
    vi.mocked(getSession).mockResolvedValue(loadUser(userId));
    const id = "kyc_014";
    const row = db.select().from(kycCases).where(eq(kycCases.id, id)).get()!;
    const events = () => listAuditEvents({ app: "kyc", entityId: id });
    const before = events().length;
    for (let load = 1; load <= 2; load++) {
      const page = await KycCasePage({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) });
      const content = textContent(page);
      expect(content).toContain(row.fullName);
      expect(content).toContain(row.documentNumber);
      expect(events()).toHaveLength(before + load);
      const audit = events()[0];
      expect(audit).toMatchObject({
        actorId: userId, actorRole: role, action: "read_pii", app: "kyc", entityId: id, outcome: "ok",
        beforeJson: null, afterJson: null,
      });
      expect(JSON.stringify(audit)).not.toContain(row.fullName);
      expect(JSON.stringify(audit)).not.toContain(row.documentNumber);
    }
  });

  it("does not record a successful PII read for a missing case", async () => {
    vi.mocked(getSession).mockResolvedValue(loadUser("u_jordan"));
    const before = listAuditEvents({ app: "kyc" }).length;
    await expect(KycCasePage({ params: Promise.resolve({ id: "missing_case" }), searchParams: Promise.resolve({}) })).rejects.toThrow("not found");
    expect(listAuditEvents({ app: "kyc" })).toHaveLength(before);
  });

  it.each(["u_sam", "u_casey"])("does not expose PII to %s", async (userId) => {
    vi.mocked(getSession).mockResolvedValue(loadUser(userId));
    const row = db.select().from(kycCases).where(eq(kycCases.id, "kyc_014")).get()!;
    const page = await KycCasePage({ params: Promise.resolve({ id: row.id }), searchParams: Promise.resolve({}) });
    expect(textContent(page)).not.toContain(row.fullName);
    expect(textContent(page)).not.toContain(row.documentNumber);
  });
});
