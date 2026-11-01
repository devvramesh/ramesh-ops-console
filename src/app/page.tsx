import { apps } from "@/apps/registry";
import { HomeTile } from "@/components/fluent/HomeTile";
import { Notice } from "@/components/fluent/Notice";
import { getSession } from "@/platform/auth";
import { auditEvents } from "@/platform/db/schema";
import { can } from "@/platform/rbac";
import { countRows } from "@/platform/stats";

export default async function HomePage() {
  const user = await getSession();
  const readable = apps.filter((a) => can(user, a.policy.app, "read"));
  const showAudit = can(user, "audit", "read");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Ops Console</h1>
        <p className="mt-1 text-sm text-neutral-600">
          {user ? `Signed in as ${user.name}. Apps you can read are listed below.` : "Sign in to see your apps."}
        </p>
      </div>
      {user && readable.length === 0 && !showAudit && (
        <Notice intent="info">
          None of the registered apps grant read access to your roles ({user.roles.join(", ") || "none"}).
        </Notice>
      )}
      <ul className="grid gap-4 sm:grid-cols-2">
        {readable.map((a) => (
          <li key={a.policy.app}>
            <HomeTile
              href={`/${a.policy.app}`}
              title={a.policy.title}
              description={a.policy.description}
              count={countRows(a.table)}
            />
          </li>
        ))}
        {showAudit && (
          <li>
            <HomeTile
              href="/audit"
              title="Audit log"
              description="Every write and every denied attempt, across all apps."
              count={countRows(auditEvents)}
            />
          </li>
        )}
      </ul>
    </div>
  );
}
