import Link from "next/link";
import { flagsPolicy } from "@/apps/flags/policy";
import { listFlags, pendingFlagIds } from "@/apps/flags/service";
import { CommandBar } from "@/components/fluent/CommandBar";
import { DataTable } from "@/components/fluent/DataTable";
import { FButton } from "@/components/fluent/fields";
import { Notice } from "@/components/fluent/Notice";
import { StatusPill } from "@/components/fluent/StatusPill";
import { formatDateTime } from "@/components/labels";
import { getSession } from "@/platform/auth";
import { can } from "@/platform/rbac";

const quietId = "font-mono text-xs text-neutral-500";

export default async function FlagsListPage() {
  const user = await getSession();
  if (!can(user, flagsPolicy.app, "read")) {
    return (
      <Notice intent="error">
        {user ? `${user.name} may not read feature flags. Requires admin, approver, or auditor.` : "Sign in to read feature flags."}
      </Notice>
    );
  }

  const flags = listFlags(user);
  const pending = pendingFlagIds(user);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">{flagsPolicy.title}</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Turning a flag off takes effect immediately. Turning a high-risk flag on needs an approver. Owner notes are shown on each flag&apos;s page.
        </p>
      </div>
      {can(user, flagsPolicy.app, "create") && (
        <CommandBar>
          <Link href="/flags/new">
            <FButton appearance="primary" size="small">
              New flag
            </FButton>
          </Link>
        </CommandBar>
      )}
      {flags.length === 0 ? (
        <p className="text-sm text-neutral-500">No flags.</p>
      ) : (
        <DataTable
          columns={["Key", "Description", "Risk", "State", "Approval", "Updated"]}
          rows={flags.map((f) => [
            <Link key="k" href={`/flags/${f.id}`} className="font-mono text-xs">
              {f.key}
            </Link>,
            f.description,
            <StatusPill key="r" status={f.risk} />,
            <StatusPill key="s" status={f.enabled ? "on" : "off"} />,
            pending.has(f.id) ? <StatusPill key="p" status="pending" /> : <span key="p" className={quietId}>-</span>,
            <span key="u" className="text-neutral-600">
              {formatDateTime(f.updatedAt)}
            </span>,
          ])}
        />
      )}
    </div>
  );
}
