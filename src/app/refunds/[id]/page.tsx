import Link from "next/link";
import { notFound } from "next/navigation";
import { decideRefundAction, payRefundAction } from "@/apps/refunds/actions";
import { formatCents, getRefund, listRefundApprovals, listRefundAudit } from "@/apps/refunds/service";
import { AuditTable } from "@/components/AuditTable";
import { getSession } from "@/platform/auth";
import { can } from "@/platform/rbac";
import { StatusBadge } from "../status";

const button = "rounded px-3 py-1.5 text-sm text-white";

export default async function RefundPage({ params, searchParams }: PageProps<"/refunds/[id]">) {
  const user = await getSession();
  if (!can(user, "refunds", "read")) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        {user ? `${user.name} may not read refunds.` : "Sign in to read refunds."}
      </div>
    );
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

  return (
    <div className="space-y-6">
      <div>
        <Link href="/refunds" className="text-sm text-slate-500 hover:text-slate-900">
          &larr; Refunds
        </Link>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="font-mono text-2xl font-semibold">{refund.id}</h1>
          <StatusBadge status={refund.status} />
        </div>
      </div>

      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

      <dl className="grid gap-x-6 gap-y-2 rounded border border-slate-200 bg-white p-4 text-sm sm:grid-cols-2">
        <dt className="text-slate-500">Customer</dt>
        <dd className="font-mono">{refund.customerRef}</dd>
        <dt className="text-slate-500">Email</dt>
        <dd>{refund.customerEmail}</dd>
        <dt className="text-slate-500">Amount</dt>
        <dd className="font-mono">
          {formatCents(refund.amountCents)} {refund.currency}
        </dd>
        <dt className="text-slate-500">Reason</dt>
        <dd>{refund.reason}</dd>
        <dt className="text-slate-500">Requested by</dt>
        <dd className="font-mono text-xs">{refund.createdBy}</dd>
        <dt className="text-slate-500">Created (UTC)</dt>
        <dd className="font-mono text-xs">{refund.createdAt}</dd>
        <dt className="text-slate-500">Updated (UTC)</dt>
        <dd className="font-mono text-xs">{refund.updatedAt}</dd>
        <dt className="text-slate-500">Processor reference</dt>
        <dd className="font-mono text-xs">{refund.processorRef ?? "-"}</dd>
      </dl>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Actions</h2>
        {canDecide && (
          <form action={decideRefundAction} className="space-y-3 rounded border border-slate-200 bg-white p-4">
            <input type="hidden" name="refundId" value={refund.id} />
            <input type="hidden" name="approvalId" value={pending.id} />
            <p className="text-sm text-slate-600">
              Requested by <span className="font-mono text-xs">{pending.requestedBy}</span>. Requires {pending.requiredRole}; the requester cannot decide.
            </p>
            <div>
              <label htmlFor="note" className="block text-sm font-medium">
                Note
              </label>
              <input id="note" name="note" className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm" />
            </div>
            <div className="flex gap-2">
              {can(user, "refunds", "approve") && (
                <button type="submit" name="decision" value="approved" className={`${button} bg-green-700 hover:bg-green-600`}>
                  Approve
                </button>
              )}
              {can(user, "refunds", "reject") && (
                <button type="submit" name="decision" value="rejected" className={`${button} bg-red-700 hover:bg-red-600`}>
                  Reject
                </button>
              )}
            </div>
          </form>
        )}
        {canPay && (
          <form action={payRefundAction} className="flex items-center gap-3 rounded border border-slate-200 bg-white p-4">
            <input type="hidden" name="refundId" value={refund.id} />
            <p className="flex-1 text-sm text-slate-600">Sends {formatCents(refund.amountCents)} to the payment processor with this refund id as the idempotency key.</p>
            <button type="submit" className={`${button} bg-slate-900 hover:bg-slate-700`}>
              Mark paid
            </button>
          </form>
        )}
        {!canDecide && !canPay && <p className="text-sm text-slate-500">No actions available to you for this refund.</p>}
      </section>

      {approvalRows.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-medium">Approvals</h2>
          <div className="overflow-x-auto rounded border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Requested by</th>
                  <th className="px-3 py-2">Requires</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Decided by</th>
                  <th className="px-3 py-2">Note</th>
                  <th className="px-3 py-2">Decided (UTC)</th>
                </tr>
              </thead>
              <tbody>
                {approvalRows.map((a) => (
                  <tr key={a.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-mono text-xs">{a.requestedBy}</td>
                    <td className="px-3 py-2">{a.requiredRole}</td>
                    <td className="px-3 py-2">{a.status}</td>
                    <td className="px-3 py-2 font-mono text-xs">{a.decidedBy ?? "-"}</td>
                    <td className="px-3 py-2">{a.note || "-"}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{a.decidedAt ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Audit trail</h2>
        <AuditTable events={events} showApp={false} />
      </section>
    </div>
  );
}
