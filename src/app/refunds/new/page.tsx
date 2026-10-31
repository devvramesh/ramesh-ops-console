import Link from "next/link";
import { createRefundAction } from "@/apps/refunds/actions";
import { getSession } from "@/platform/auth";
import { can } from "@/platform/rbac";

const input = "w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm";

export default async function NewRefundPage({ searchParams }: PageProps<"/refunds/new">) {
  const user = await getSession();
  if (!can(user, "refunds", "create")) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        {user ? `${user.name} may not create refunds. Requires support.` : "Sign in to create a refund."}
      </div>
    );
  }
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;

  return (
    <div className="max-w-lg space-y-4">
      <div>
        <Link href="/refunds" className="text-sm text-slate-500 hover:text-slate-900">
          &larr; Refunds
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">New refund</h1>
        <p className="mt-1 text-sm text-slate-600">Over $500.00 goes to an approver. At or under $500.00 is approved on creation.</p>
      </div>
      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      <form action={createRefundAction} className="space-y-3 rounded border border-slate-200 bg-white p-4">
        <div>
          <label htmlFor="customerRef" className="block text-sm font-medium">
            Customer reference
          </label>
          <input id="customerRef" name="customerRef" required maxLength={64} placeholder="cus_1234" className={input} />
        </div>
        <div>
          <label htmlFor="customerEmail" className="block text-sm font-medium">
            Customer email
          </label>
          <input id="customerEmail" name="customerEmail" type="email" required className={input} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="amount" className="block text-sm font-medium">
              Amount (USD)
            </label>
            <input id="amount" name="amount" required inputMode="decimal" placeholder="600.00" className={input} />
          </div>
          <div>
            <label htmlFor="currency" className="block text-sm font-medium">
              Currency
            </label>
            <input id="currency" name="currency" value="USD" readOnly className={`${input} bg-slate-50 text-slate-500`} />
          </div>
        </div>
        <div>
          <label htmlFor="reason" className="block text-sm font-medium">
            Reason
          </label>
          <textarea id="reason" name="reason" required maxLength={500} rows={3} className={input} />
        </div>
        <button type="submit" className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-700">
          Create refund
        </button>
      </form>
    </div>
  );
}
