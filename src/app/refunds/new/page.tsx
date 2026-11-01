import Link from "next/link";
import { createRefundAction } from "@/apps/refunds/actions";
import { REFUND_REASON_CODES, REFUND_REASON_LABELS } from "@/apps/refunds/schema";
import { FButton, FInput, FSelect, FTextarea } from "@/components/fluent/fields";
import { Notice } from "@/components/fluent/Notice";
import { getSession } from "@/platform/auth";
import { can } from "@/platform/rbac";

export default async function NewRefundPage({ searchParams }: PageProps<"/refunds/new">) {
  const user = await getSession();
  if (!can(user, "refunds", "create")) {
    return (
      <Notice intent="error">
        {user ? `${user.name} may not create refunds. Requires support.` : "Sign in to create a refund."}
      </Notice>
    );
  }
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;

  return (
    <div className="max-w-lg space-y-4">
      <div>
        <Link href="/refunds" className="text-sm text-neutral-500 hover:text-neutral-900">
          &larr; Refunds
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">New refund</h1>
        <p className="mt-1 text-sm text-neutral-600">Over $500.00 goes to an approver. At or under $500.00 is approved on creation.</p>
      </div>
      {error && <Notice intent="error">{error}</Notice>}
      <form action={createRefundAction} className="space-y-3 rounded border border-neutral-200 bg-white p-4">
        <div>
          <label htmlFor="customerRef" className="block text-sm font-medium">
            Customer reference
          </label>
          <FInput id="customerRef" name="customerRef" required maxLength={64} placeholder="cus_1234" className="w-full" />
        </div>
        <div>
          <label htmlFor="customerEmail" className="block text-sm font-medium">
            Customer email
          </label>
          <FInput id="customerEmail" name="customerEmail" type="email" required className="w-full" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="amount" className="block text-sm font-medium">
              Amount (USD)
            </label>
            <FInput id="amount" name="amount" required inputMode="decimal" placeholder="600.00" className="w-full" />
          </div>
          <div>
            <label htmlFor="currency" className="block text-sm font-medium">
              Currency
            </label>
            <FInput id="currency" name="currency" value="USD" readOnly className="w-full" />
          </div>
        </div>
        <div>
          <label htmlFor="reasonCode" className="block text-sm font-medium">
            Reason code
          </label>
          <FSelect id="reasonCode" name="reasonCode" required defaultValue="" className="w-full">
            <option value="" disabled>
              Choose a reason
            </option>
            {REFUND_REASON_CODES.map((code) => (
              <option key={code} value={code}>
                {REFUND_REASON_LABELS[code]}
              </option>
            ))}
          </FSelect>
        </div>
        <div>
          <label htmlFor="reason" className="block text-sm font-medium">
            Details
          </label>
          <FTextarea id="reason" name="reason" required maxLength={500} rows={3} className="w-full" />
        </div>
        <FButton type="submit" appearance="primary">
          Create refund
        </FButton>
      </form>
    </div>
  );
}
