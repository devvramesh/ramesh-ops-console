import { apps } from "@/apps/registry";
import { AuditTable } from "@/components/AuditTable";
import { listAuditEvents } from "@/platform/audit";
import { getSession } from "@/platform/auth";
import { can } from "@/platform/rbac";

export default async function AuditPage({ searchParams }: PageProps<"/audit">) {
  const user = await getSession();
  if (!can(user, "audit", "read")) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        {user ? `${user.name} may not read the audit log. Requires auditor or admin.` : "Sign in to read the audit log."}
      </div>
    );
  }

  const params = await searchParams;
  const selected = typeof params.app === "string" ? params.app : "";
  const appNames = [...apps.map((a) => a.policy.app), "audit"];
  const events = listAuditEvents(selected ? { app: selected } : {});

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Audit log</h1>
          <p className="mt-1 text-sm text-slate-600">Append-only. PII fields are redacted before they are written.</p>
        </div>
        <form method="get" className="flex items-center gap-2 text-sm">
          <label htmlFor="app-filter" className="text-slate-600">
            App
          </label>
          <select id="app-filter" name="app" defaultValue={selected} className="rounded border border-slate-300 bg-white px-2 py-1">
            <option value="">all</option>
            {appNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <button type="submit" className="rounded border border-slate-300 bg-white px-3 py-1 hover:bg-slate-50">
            Filter
          </button>
        </form>
      </div>
      <AuditTable events={events} />
    </div>
  );
}
