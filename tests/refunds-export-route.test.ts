import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { GET } from "@/app/refunds/export/route";
import { EXPORT_COLUMNS } from "@/apps/refunds/service";
import { listAuditEvents } from "@/platform/audit";
import { getSession, loadUser } from "@/platform/auth";

vi.mock("@/platform/auth", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/platform/auth")>(),
  getSession: vi.fn(),
}));

const request = (query: string) => new NextRequest(`http://localhost:3000/refunds/export${query}`);
const exportRows = () => listAuditEvents({ app: "refunds" }).filter((r) => r.action === "export");

describe("GET /refunds/export", () => {
  it("returns a CSV attachment for an approver and audits it", async () => {
    vi.mocked(getSession).mockResolvedValue(loadUser("u_avery"));
    const before = exportRows().length;
    const res = await GET(request("?month=2026-01"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="refunds-2026-01.csv"');
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect((await res.text()).split("\r\n")[0]).toBe(EXPORT_COLUMNS.join(","));
    expect(exportRows()).toHaveLength(before + 1);
    expect(exportRows()[0]).toMatchObject({ actorId: "u_avery", outcome: "ok" });
  });

  it("defaults to the current UTC month", async () => {
    vi.mocked(getSession).mockResolvedValue(loadUser("u_casey"));
    const res = await GET(request(""));
    expect(res.headers.get("content-disposition")).toContain(`refunds-${new Date().toISOString().slice(0, 7)}.csv`);
  });

  it("returns 403 for support and audits the denial", async () => {
    vi.mocked(getSession).mockResolvedValue(loadUser("u_sam"));
    const res = await GET(request("?month=2026-01"));
    expect(res.status).toBe(403);
    expect(exportRows()[0]).toMatchObject({ actorId: "u_sam", outcome: "denied" });
  });

  it("returns 400 for a malformed month", async () => {
    vi.mocked(getSession).mockResolvedValue(loadUser("u_avery"));
    expect((await GET(request("?month=jan"))).status).toBe(400);
  });
});
