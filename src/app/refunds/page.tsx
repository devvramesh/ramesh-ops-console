import Link from "next/link";
import { formatCents, listRefunds, maskEmail } from "@/apps/refunds/service";
import { getSession } from "@/platform/auth";
import { can } from "@/platform/rbac";
import { StatusBadge } from "./status";

export default async function RefundsPage() {
  const user = await getSession();
  if (!can(user, "refunds", "read")) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        {user ? `${user.name} may not read refunds.` : "Sign in to read refunds."}
      </div>
    );
  }
  const rows = listRefunds(user);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Refunds</h1>
          <p className="mt-1 text-sm text-slate-600">Refunds over $500.00 wait for an approver. Customer emails are masked here.</p>
        </div>
        {can(user, "refunds", "create") && (
          <Link href="/refunds/new" className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-700">
            New refund
          </Link>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">No refunds.</p>
      ) : (
        <div className="overflow-x-auto rounded border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Refund</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Reason</th>
                <th className="px-3 py-2">Created (UTC)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-mono text-xs">
                    <Link href={`/refunds/${r.id}`} className="text-blue-700 hover:underline">
                      {r.id}
                    </Link>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{r.customerRef}</td>
                  <td className="px-3 py-2">{maskEmail(r.customerEmail)}</td>
                  <td className="px-3 py-2 text-right font-mono">{formatCents(r.amountCents)}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-3 py-2 text-slate-600">{r.reason}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{r.createdAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
