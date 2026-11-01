import { describe, expect, it } from "vitest";
import { formatDateTime, statusLabel } from "@/components/labels";
import { apps } from "@/apps/registry";
import { countRows } from "@/platform/stats";

describe("labels", () => {
  it("renders readable status labels", () => {
    expect(statusLabel("pending_approval")).toBe("Pending approval");
    expect(statusLabel("in_review")).toBe("In review");
    expect(statusLabel("paid")).toBe("Paid");
    expect(statusLabel("something_new")).toBe("Something new");
  });

  it("formats UTC timestamps like 'Oct 18, 2026, 6:25 PM UTC'", () => {
    expect(formatDateTime("2026-10-18T18:25:00.000Z")).toBe("Oct 18, 2026, 6:25 PM UTC");
  });
});

describe("countRows", () => {
  it("returns seeded row counts for each registered app", () => {
    for (const app of apps) {
      expect(countRows(app.table)).toBeGreaterThan(0);
    }
  });
});
