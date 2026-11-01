import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AuditTable } from "@/components/AuditTable";
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

describe("audit table timestamps", () => {
  it.each([true, false])("allows timestamps to wrap with showApp=%s", (showApp) => {
    const html = renderToStaticMarkup(createElement(AuditTable, {
      showApp,
      events: [{
        id: 1,
        ts: "2026-10-18T18:25:00.000Z",
        actorId: "u_jordan",
        actorRole: "analyst",
        action: "read_pii",
        app: "kyc",
        entityId: "kyc_001",
        outcome: "ok",
        beforeJson: null,
        afterJson: null,
        requestId: "test-request",
      }],
    }));
    const timestamp = html.match(/<span\b[^>]*>Oct 18, 2026, 6:25 PM UTC<\/span>/)?.[0];
    expect(timestamp).toBeDefined();
    expect(timestamp).not.toContain("whitespace-nowrap");
    expect(html).toContain("overflow-wrap:anywhere");
  });
});

describe("countRows", () => {
  it("returns seeded row counts for each registered app", () => {
    for (const app of apps) {
      expect(countRows(app.table)).toBeGreaterThan(0);
    }
  });
});
