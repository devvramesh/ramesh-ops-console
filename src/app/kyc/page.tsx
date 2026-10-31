import Link from "next/link";
import { kycPolicy } from "@/apps/kyc/policy";
import { CASE_STATUSES } from "@/apps/kyc/schema";
import { listCases } from "@/apps/kyc/service";
import { getSession } from "@/platform/auth";
import { can } from "@/platform/rbac";
import { CaseStatusBadge, maskDocument, maskName, RiskBadge } from "./ui";

export default async function KycListPage({ searchParams }: PageProps<"/kyc">) {
  const user = await getSession();
  if (!can(user, kycPolicy.app, "read")) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        {user ? `${user.name} may not read the KYC queue. Requires analyst, approver, or auditor.` : "Sign in to read the KYC queue."}
      </div>
    );
  }

  const params = await searchParams;
  const status = typeof params.status === "string" && (CASE_STATUSES as readonly string[]).includes(params.status) ? params.status : "";
  const cases = listCases(user, status ? { status } : {});

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{kycPolicy.title}</h1>
          <p className="mt-1 text-sm text-slate-600">Names and document numbers are masked here. Open a case to see them.</p>
        </div>
        <form method="get" className="flex items-center gap-2 text-sm">
          <label htmlFor="status-filter" className="text-slate-600">
            Status
          </label>
          <select id="status-filter" name="status" defaultValue={status} className="rounded border border-slate-300 bg-white px-2 py-1">
            <option value="">all</option>
            {CASE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button type="submit" className="rounded border border-slate-300 bg-white px-3 py-1 hover:bg-slate-50">
            Filter
          </button>
        </form>
      </div>
      {cases.length === 0 ? (
        <p className="text-sm text-slate-500">No cases.</p>
      ) : (
        <div className="overflow-x-auto rounded border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Case</th>
                <th className="px-3 py-2">Subject</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Document</th>
                <th className="px-3 py-2">Risk</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Assignee</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-mono text-xs">
                    <Link href={`/kyc/${c.id}`} className="text-blue-700 underline-offset-2 hover:underline">
                      {c.id}
                    </Link>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{c.subjectRef}</td>
                  <td className="px-3 py-2">{maskName(c.fullName)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{maskDocument(c.documentNumber)}</td>
                  <td className="px-3 py-2">
                    <RiskBadge tier={c.riskTier} />
                  </td>
                  <td className="px-3 py-2">
                    <CaseStatusBadge status={c.status} />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{c.assignee ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
