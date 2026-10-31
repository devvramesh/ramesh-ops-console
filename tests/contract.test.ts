import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { apps } from "@/apps/registry";
import { listAuditEvents } from "@/platform/audit";
import { loadUser } from "@/platform/auth";
import { db } from "@/platform/db/client";
import { SEEDED_USERS } from "@/platform/db/seed";
import { auditEvents } from "@/platform/db/schema";
import { piiFields, REDACTED } from "@/platform/redact";

const FORBIDDEN = ["db.insert(", "db.update(", "db.delete(", "db.run("];

function walk(dir: string): string[] {
  if (!statSync(dir, { throwIfNoEntry: false })) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe("no raw writes outside src/platform", () => {
  it("src/apps and src/app contain no db.insert/update/delete/run", () => {
    const offenders: string[] = [];
    for (const file of [...walk("src/apps"), ...walk("src/app")]) {
      if (!/\.(ts|tsx)$/.test(file)) continue;
      const text = readFileSync(file, "utf8");
      for (const needle of FORBIDDEN) if (text.includes(needle)) offenders.push(`${file}: ${needle}`);
    }
    expect(offenders).toEqual([]);
  });
});

describe.each(apps.map((entry) => [entry.policy.app, entry] as const))("app %s", (app, entry) => {
  it("declares permissions", () => {
    expect(Object.keys(entry.policy.permissions).length).toBeGreaterThan(0);
    for (const [action, roles] of Object.entries(entry.policy.permissions)) {
      expect(roles.length, `${action} lists no roles`).toBeGreaterThan(0);
    }
  });

  it("marks only real columns as PII", () => {
    const columns = getTableColumns(entry.table);
    const names = new Set([...Object.keys(columns), ...Object.values(columns).map((c) => c.name)]);
    for (const field of entry.policy.pii) {
      expect(names.has(field), `pii field ${field} is not a column`).toBe(true);
    }
  });

  it("contractWrite adds exactly one redacted audit row", async () => {
    const allowed = entry.policy.permissions[entry.contractWrite.action];
    expect(allowed, `contractWrite action ${entry.contractWrite.action} is not in the policy`).toBeTruthy();
    const seeded = SEEDED_USERS.find((u) => u.roles.some((r) => allowed!.includes(r)));
    expect(seeded, "no seeded user holds a permitted role").toBeTruthy();
    const user = loadUser(seeded!.id)!;

    const seededRows = db.select().from(entry.table).all() as Record<string, unknown>[];
    const pii = piiFields(app);
    const piiValues = seededRows.flatMap((row) =>
      Object.entries(row)
        .filter(([k, v]) => pii.has(k) && typeof v === "string" && v.length > 0)
        .map(([, v]) => v as string),
    );

    const count = () => db.select({ n: sql<number>`count(*)` }).from(auditEvents).where(eq(auditEvents.app, app)).get()!.n;
    const before = count();
    await entry.contractWrite.run(user);
    expect(count()).toBe(before + 1);

    const row = listAuditEvents({ app, limit: 1 })[0];
    expect(row).toMatchObject({ actorId: user.id, action: entry.contractWrite.action, outcome: "ok" });
    const json = `${row.beforeJson ?? ""}${row.afterJson ?? ""}`;
    for (const value of piiValues) expect(json, `audit row contains PII value`).not.toContain(value);
    for (const blob of [row.beforeJson, row.afterJson]) {
      if (!blob) continue;
      const parsed = JSON.parse(blob) as Record<string, unknown>;
      for (const [k, v] of Object.entries(parsed)) {
        if (pii.has(k) && v != null) expect(v, `${k} is not redacted`).toBe(REDACTED);
      }
    }
  });
});
