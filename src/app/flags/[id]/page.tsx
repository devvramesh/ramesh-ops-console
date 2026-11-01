import Link from "next/link";
import { notFound } from "next/navigation";
import { decideFlagApprovalAction, disableFlagAction, enableFlagAction } from "@/apps/flags/actions";
import { flagsPolicy } from "@/apps/flags/policy";
import { flagApprovals, flagAudit, getFlag } from "@/apps/flags/service";
import { AuditTable } from "@/components/AuditTable";
import { DataTable } from "@/components/fluent/DataTable";
import { FButton, FTextarea } from "@/components/fluent/fields";
import { Notice } from "@/components/fluent/Notice";
import { StatusPill } from "@/components/fluent/StatusPill";
import { formatDateTime } from "@/components/labels";
import { getSession } from "@/platform/auth";
import { can } from "@/platform/rbac";

const quiet = "font-mono text-xs text-neutral-500";
const card = "rounded border border-neutral-200 bg-white p-4";

export default async function FlagPage({ params, searchParams }: PageProps<"/flags/[id]">) {
  const user = await getSession();
  if (!can(user, flagsPolicy.app, "read")) {
    return (
      <Notice intent="error">
        {user ? `${user.name} may not read feature flags. Requires admin, approver, or auditor.` : "Sign in to read feature flags."}
      </Notice>
    );
  }

  const { id } = await params;
  const { error } = await searchParams;
  const flag = getFlag(user, id);
  if (!flag) notFound();

  const approvals = flagApprovals(user, id);
  const pending = approvals.find((a) => a.status === "pending");
  const events = flagAudit(user, id);

  const canDisable = flag.enabled && can(user, flagsPolicy.app, "disable");
  const canEnable = !flag.enabled && !pending && can(user, flagsPolicy.app, "enable");
  const canDecide = !!pending && pending.requestedBy !== user!.id && user!.roles.includes(flagsPolicy.approval!.requiredRole);

  const fields: [string, React.ReactNode][] = [
    ["Key", <span key="v" className="font-mono text-sm">{flag.key}</span>],
    ["Description", flag.description],
    ["Owner note", flag.ownerNote ?? "-"],
    ["Created by", <span key="v" className={quiet}>{flag.createdBy}</span>],
    ["Created", formatDateTime(flag.createdAt)],
    ["Updated", formatDateTime(flag.updatedAt)],
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/flags" className="text-sm text-neutral-500 hover:text-neutral-900">
          &larr; Feature flags
        </Link>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="font-mono text-lg text-neutral-600">{flag.key}</h1>
          <StatusPill status={flag.enabled ? "on" : "off"} />
          <StatusPill status={flag.risk} />
        </div>
      </div>

      {typeof error === "string" && error && <Notice intent="error">{error}</Notice>}

      <dl className={`grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 ${card}`}>
        {fields.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-neutral-500">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      {canDisable && (
        <form action={disableFlagAction} className={`flex items-center gap-3 ${card}`}>
          <input type="hidden" name="id" value={flag.id} />
          <span className="text-sm text-neutral-600">Kill switch: turns the flag off now. No approval needed.</span>
          <FButton type="submit" appearance="primary">
            Turn off
          </FButton>
        </form>
      )}

      {canEnable && (
        <form action={enableFlagAction} className={`flex items-center gap-3 ${card}`}>
          <input type="hidden" name="id" value={flag.id} />
          <span className="text-sm text-neutral-600">
            {flag.risk === "high"
              ? "High risk: this sends a request that an approver must approve before the flag turns on."
              : "Low risk: the flag turns on now."}
          </span>
          <FButton type="submit" appearance="outline">
            {flag.risk === "high" ? "Request to turn on" : "Turn on"}
          </FButton>
        </form>
      )}

      {pending && (
        <div className="space-y-3 rounded border border-amber-200 bg-amber-50 p-4 text-sm">
          <p>
            Waiting for approval #{pending.id} to turn this flag on: requested by <span className={quiet}>{pending.requestedBy}</span>, requires{" "}
            <span className="font-medium">{pending.requiredRole}</span>.
          </p>
          {canDecide ? (
            <form action={decideFlagApprovalAction} className="space-y-3">
              <input type="hidden" name="id" value={flag.id} />
              <input type="hidden" name="approvalId" value={pending.id} />
              <label htmlFor="approval-note" className="block font-medium">
                Approver note
              </label>
              <FTextarea id="approval-note" name="note" required rows={2} className="w-full" />
              <div className="flex gap-2">
                <FButton type="submit" name="decision" value="approved" appearance="primary">
                  Approve request
                </FButton>
                <FButton type="submit" name="decision" value="rejected" appearance="outline">
                  Reject request
                </FButton>
              </div>
            </form>
          ) : (
            <p className="text-neutral-600">
              {pending.requestedBy === user!.id ? "You requested this approval and cannot decide it." : "Only an approver can decide this request."}
            </p>
          )}
        </div>
      )}

      {approvals.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-medium">Approvals</h2>
          <DataTable
            columns={["#", "Requested by", "Status", "Decided by", "Note", "Decided"]}
            rows={approvals.map((a) => [
              <span key="i" className={quiet}>
                {a.id}
              </span>,
              <span key="r" className={quiet}>
                {a.requestedBy}
              </span>,
              <StatusPill key="s" status={a.status} />,
              <span key="d" className={quiet}>
                {a.decidedBy ?? "-"}
              </span>,
              a.note ?? "-",
              <span key="t" className="text-neutral-600">
                {a.decidedAt ? formatDateTime(a.decidedAt) : "-"}
              </span>,
            ])}
          />
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Audit trail</h2>
        <AuditTable events={events} showApp={false} />
      </section>
    </div>
  );
}
