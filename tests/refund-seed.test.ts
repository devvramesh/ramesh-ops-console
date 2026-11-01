import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { refunds } from "@/apps/refunds/schema";
import { seedRefunds } from "@/apps/refunds/seed";
import { refundSummary } from "@/apps/refunds/service";
import { approvals } from "@/platform/approvals/schema";
import { loadUser } from "@/platform/auth";
import { db } from "@/platform/db/client";

afterEach(() => vi.useRealTimers());

describe("relative refund seed dates", () => {
  it.each([
    "2030-02-01T00:30:00.000Z",
    "2032-02-29T23:30:00.000Z",
    "2031-01-01T00:15:00.000Z",
    "2030-12-31T23:59:00.000Z",
  ])("keeps the monthly count populated and dates consistent when seeded at %s", (now) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(now));
    const rollback = new Error("roll back seed test");

    try {
      db.transaction((tx) => {
        tx.delete(approvals).where(eq(approvals.app, "refunds")).run();
        tx.delete(refunds).run();
        seedRefunds(tx);

        const rows = tx.select().from(refunds).all();
        expect(rows).toHaveLength(12);
        const thisMonth = rows.filter((r) => r.createdAt.slice(0, 7) === now.slice(0, 7));
        expect(thisMonth.length).toBeGreaterThan(0);
        expect(refundSummary(loadUser("u_quinn")).refundsThisMonth).toBe(thisMonth.length);
        for (const row of rows) {
          expect(Date.parse(row.createdAt)).toBeLessThanOrEqual(Date.parse(now));
          expect(Date.parse(row.createdAt)).toBeGreaterThanOrEqual(Date.parse(now) - 17 * 86400_000);
          expect(Date.parse(row.updatedAt)).toBeGreaterThanOrEqual(Date.parse(row.createdAt));
          expect(Date.parse(row.updatedAt)).toBeLessThanOrEqual(Date.parse(now));
        }
        for (const approval of tx.select().from(approvals).where(eq(approvals.app, "refunds")).all()) {
          const refund = rows.find((r) => r.id === approval.entityId)!;
          expect(approval.createdAt).toBe(refund.createdAt);
          expect(approval.decidedAt).toBe(approval.status === "pending" ? null : refund.updatedAt);
        }
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
  });
});
