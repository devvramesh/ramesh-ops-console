import Link from "next/link";
import { apps } from "@/apps/registry";
import { getSession } from "@/platform/auth";
import { can } from "@/platform/rbac";

export default async function HomePage() {
  const user = await getSession();
  const readable = apps.filter((a) => can(user, a.policy.app, "read"));
  const showAudit = can(user, "audit", "read");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Ops Console</h1>
        <p className="mt-1 text-sm text-slate-600">
          {user ? `Signed in as ${user.name}. Apps you can read are listed below.` : "Sign in to see your apps."}
        </p>
      </div>
      {user && readable.length === 0 && !showAudit && (
        <p className="rounded border border-slate-200 bg-white p-4 text-sm text-slate-600">
          None of the registered apps grant read access to your roles ({user.roles.join(", ") || "none"}).
        </p>
      )}
      <ul className="grid gap-4 sm:grid-cols-2">
        {readable.map((a) => (
          <li key={a.policy.app}>
            <Link href={`/${a.policy.app}`} className="block rounded border border-slate-200 bg-white p-4 hover:border-slate-400">
              <div className="font-medium">{a.policy.title}</div>
              <div className="mt-1 text-sm text-slate-600">{a.policy.description}</div>
            </Link>
          </li>
        ))}
        {showAudit && (
          <li>
            <Link href="/audit" className="block rounded border border-slate-200 bg-white p-4 hover:border-slate-400">
              <div className="font-medium">Audit log</div>
              <div className="mt-1 text-sm text-slate-600">Every write and every denied attempt, across all apps.</div>
            </Link>
          </li>
        )}
      </ul>
    </div>
  );
}
