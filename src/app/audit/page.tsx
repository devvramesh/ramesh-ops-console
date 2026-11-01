import { apps } from "@/apps/registry";
import { AuditTable } from "@/components/AuditTable";
import { CommandBar } from "@/components/fluent/CommandBar";
import { FButton, FSelect } from "@/components/fluent/fields";
import { Notice } from "@/components/fluent/Notice";
import { listAuditEvents } from "@/platform/audit";
import { getSession } from "@/platform/auth";
import { can } from "@/platform/rbac";

export default async function AuditPage({ searchParams }: PageProps<"/audit">) {
  const user = await getSession();
  if (!can(user, "audit", "read")) {
    return (
      <Notice intent="error">
        {user ? `${user.name} may not read the audit log. Requires auditor or admin.` : "Sign in to read the audit log."}
      </Notice>
    );
  }

  const params = await searchParams;
  const selected = typeof params.app === "string" ? params.app : "";
  const appNames = [...apps.map((a) => a.policy.app), "audit"];
  const events = listAuditEvents(selected ? { app: selected } : {});

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Audit log</h1>
        <p className="mt-1 text-sm text-neutral-600">Append-only. PII fields are redacted before they are written.</p>
      </div>
      <CommandBar>
        <form method="get" className="flex items-center gap-2">
          <label htmlFor="app-filter" className="text-sm text-neutral-600">
            App
          </label>
          <FSelect id="app-filter" name="app" defaultValue={selected} size="small">
            <option value="">all</option>
            {appNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </FSelect>
          <FButton type="submit" size="small" appearance="subtle">
            Filter
          </FButton>
        </form>
      </CommandBar>
      <AuditTable events={events} />
    </div>
  );
}
