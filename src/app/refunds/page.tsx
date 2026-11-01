import Link from "next/link";
import { formatCents, listRefunds, maskEmail, refundSummary } from "@/apps/refunds/service";
import { CommandBar } from "@/components/fluent/CommandBar";
import { DataTable } from "@/components/fluent/DataTable";
import { FButton } from "@/components/fluent/fields";
import { Notice } from "@/components/fluent/Notice";
import { StatusPill } from "@/components/fluent/StatusPill";
import { SummaryTile } from "@/components/fluent/SummaryTile";
import { formatDateTime } from "@/components/labels";
import { getSession } from "@/platform/auth";
import { can } from "@/platform/rbac";

const quietId = "font-mono text-xs text-neutral-500";

function formatDuration(ms: number) {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  return hours < 48 ? `${hours.toFixed(1)} hrs` : `${(hours / 24).toFixed(1)} days`;
}

export default async function RefundsPage() {
  const user = await getSession();
  if (!can(user, "refunds", "read")) {
    return (
      <Notice intent="error">
        {user ? `${user.name} may not read refunds.` : "Sign in to read refunds."}
      </Notice>
    );
  }
  const rows = listRefunds(user);
  const summary = refundSummary(user);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Refunds</h1>
        <p className="mt-1 text-sm text-neutral-600">Refunds over $500.00 wait for an approver. Customer emails are masked here.</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <SummaryTile label="Refunds this month" value={String(summary.refundsThisMonth)} />
        <SummaryTile label="Pending approvals" value={String(summary.pendingApprovals)} />
        <SummaryTile
          label="Average time to approve"
          value={summary.avgApprovalMs == null ? "-" : formatDuration(summary.avgApprovalMs)}
        />
      </div>
      <CommandBar>
        {can(user, "refunds", "create") && (
          <FButton as="a" href="/refunds/new" appearance="primary" size="small">
            New refund
          </FButton>
        )}
      </CommandBar>
      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500">No refunds.</p>
      ) : (
        <DataTable
          columns={["Refund", "Customer", "Email", "Amount", "Status", "Reason", "Created"]}
          rows={rows.map((r) => [
            <Link key="id" href={`/refunds/${r.id}`} className={quietId}>
              {r.id}
            </Link>,
            <span key="c" className={quietId}>
              {r.customerRef}
            </span>,
            maskEmail(r.customerEmail),
            <span key="a" className="font-mono">
              {formatCents(r.amountCents)}
            </span>,
            <StatusPill key="s" status={r.status} />,
            <span key="r" className="text-neutral-600">
              {r.reason}
            </span>,
            <span key="t" className="text-neutral-600">
              {formatDateTime(r.createdAt)}
            </span>,
          ])}
        />
      )}
    </div>
  );
}
