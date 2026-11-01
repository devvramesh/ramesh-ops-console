import Link from "next/link";
import { notFound } from "next/navigation";
import { decideRefundAction, payRefundAction } from "@/apps/refunds/actions";
import { formatCents, getRefund, listRefundApprovals, listRefundAudit } from "@/apps/refunds/service";
import { AuditTable } from "@/components/AuditTable";
import { DataTable } from "@/components/fluent/DataTable";
import { FButton, FInput } from "@/components/fluent/fields";
import { Notice } from "@/components/fluent/Notice";
import { StatusPill } from "@/components/fluent/StatusPill";
import { formatDateTime, statusLabel } from "@/components/labels";
import { getSession } from "@/platform/auth";
import { can } from "@/platform/rbac";

const quiet = "font-mono text-xs text-neutral-500";

export default async function RefundPage({ params, searchParams }: PageProps<"/refunds/[id]">) {
  const user = await getSession();
  if (!can(user, "refunds", "read")) {
    return <Notice intent="error">{user ? `${user.name} may not read refunds.` : "Sign in to read refunds."}</Notice>;
  }
  const { id } = await params;
  const refund = getRefund(user, id);
  if (!refund) notFound();

  const query = await searchParams;
  const error = typeof query.error === "string" ? query.error : null;
  const approvalRows = listRefundApprovals(user, id);
  const pending = approvalRows.find((a) => a.status === "pending");
  const events = listRefundAudit(user, id);

  const canDecide = refund.status === "pending_approval" && pending && (can(user, "refunds", "approve") || can(user, "refunds", "reject"));
  const canPay = refund.status === "approved" && can(user, "refunds", "pay");

  const fields: [string, React.ReactNode][] = [
    ["Customer", <span key="v" className={quiet}>{refund.customerRef}</span>],
    ["Email", refund.customerEmail],
    [
      "Amount",
      <span key="v" className="font-mono">
        {formatCents(refund.amountCents)} {refund.currency}
      </span>,
    ],
    ["Reason", refund.reason],
    ["Requested by", <span key="v" className={quiet}>{refund.createdBy}</span>],
    ["Created", formatDateTime(refund.createdAt)],
    ["Updated", formatDateTime(refund.updatedAt)],
    ["Processor reference", <span key="v" className={quiet}>{refund.processorRef ?? "-"}</span>],
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/refunds" className="text-sm text-neutral-500 hover:text-neutral-900">
          &larr; Refunds
        </Link>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="font-mono text-lg text-neutral-600">{refund.id}</h1>
          <StatusPill status={refund.status} />
        </div>
      </div>

      {error && <Notice intent="error">{error}</Notice>}

      <dl className="grid gap-x-6 gap-y-2 rounded border border-neutral-200 bg-white p-4 text-sm sm:grid-cols-2">
        {fields.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-neutral-500">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Actions</h2>
        {canDecide && (
          <form action={decideRefundAction} className="space-y-3 rounded border border-neutral-200 bg-white p-4">
            <input type="hidden" name="refundId" value={refund.id} />
            <input type="hidden" name="approvalId" value={pending.id} />
            <p className="text-sm text-neutral-600">
              Requested by <span className={quiet}>{pending.requestedBy}</span>. Requires {pending.requiredRole}; the requester cannot
              decide.
            </p>
            <div>
              <label htmlFor="note" className="block text-sm font-medium">
                Note
              </label>
              <FInput id="note" name="note" className="w-full" />
            </div>
            <div className="flex gap-2">
              {can(user, "refunds", "approve") && (
                <FButton type="submit" name="decision" value="approved" appearance="primary">
                  Approve
                </FButton>
              )}
              {can(user, "refunds", "reject") && (
                <FButton type="submit" name="decision" value="rejected" appearance="outline">
                  Reject
                </FButton>
              )}
            </div>
          </form>
        )}
        {canPay && (
          <form action={payRefundAction} className="flex items-center gap-3 rounded border border-neutral-200 bg-white p-4">
            <input type="hidden" name="refundId" value={refund.id} />
            <p className="flex-1 text-sm text-neutral-600">
              Sends {formatCents(refund.amountCents)} to the payment processor with this refund id as the idempotency key.
            </p>
            <FButton type="submit" appearance="primary">
              Mark paid
            </FButton>
          </form>
        )}
        {!canDecide && !canPay && <p className="text-sm text-neutral-500">No actions available to you for this refund.</p>}
      </section>

      {approvalRows.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-medium">Approvals</h2>
          <DataTable
            columns={["Requested by", "Requires", "Status", "Decided by", "Note", "Decided"]}
            rows={approvalRows.map((a) => [
              <span key="r" className={quiet}>
                {a.requestedBy}
              </span>,
              a.requiredRole,
              statusLabel(a.status),
              <span key="d" className={quiet}>
                {a.decidedBy ?? "-"}
              </span>,
              a.note || "-",
              <span key="t" className="whitespace-nowrap text-neutral-600">
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
