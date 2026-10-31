import Link from "next/link";
import { notFound } from "next/navigation";
import { claimAction, decideApprovalAction, decideCaseAction } from "@/apps/kyc/actions";
import { kycPolicy } from "@/apps/kyc/policy";
import { caseApprovals, caseAudit, getCase } from "@/apps/kyc/service";
import { AuditTable } from "@/components/AuditTable";
import { getSession } from "@/platform/auth";
import { can } from "@/platform/rbac";
import { CaseStatusBadge, RiskBadge } from "../ui";

const inputClass = "w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm";
const primaryButton = "rounded bg-slate-900 px-3 py-1 text-sm text-white hover:bg-slate-700";
const dangerButton = "rounded border border-red-300 bg-white px-3 py-1 text-sm text-red-800 hover:bg-red-50";

export default async function KycCasePage({ params, searchParams }: PageProps<"/kyc/[id]">) {
  const user = await getSession();
  if (!can(user, kycPolicy.app, "read")) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        {user ? `${user.name} may not read KYC cases. Requires analyst, approver, or auditor.` : "Sign in to read KYC cases."}
      </div>
    );
  }

  const { id } = await params;
  const { error } = await searchParams;
  const row = getCase(user, id);
  if (!row) notFound();

  const approvals = caseApprovals(user, id);
  const pending = approvals.find((a) => a.status === "pending");
  const events = caseAudit(user, id);

  const canClaim = row.status === "new" && can(user, kycPolicy.app, "claim");
  const isAssignee = row.assignee === user!.id;
  const canApprove = row.status === "in_review" && isAssignee && !pending && can(user, kycPolicy.app, "approve");
  const canReject = row.status === "in_review" && isAssignee && !pending && can(user, kycPolicy.app, "reject");
  const canDecideApproval = !!pending && pending.requestedBy !== user!.id && user!.roles.includes(kycPolicy.approval!.requiredRole);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/kyc" className="text-sm text-slate-500 hover:text-slate-900">
          &larr; KYC review queue
        </Link>
        <h1 className="mt-1 flex items-center gap-3 text-2xl font-semibold">
          <span className="font-mono">{row.id}</span>
          <CaseStatusBadge status={row.status} />
          <RiskBadge tier={row.riskTier} />
        </h1>
      </div>

      {typeof error === "string" && error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
      )}

      <dl className="grid gap-x-6 gap-y-2 rounded border border-slate-200 bg-white p-4 text-sm sm:grid-cols-2">
        <dt className="text-slate-500">Subject</dt>
        <dd className="font-mono">{row.subjectRef}</dd>
        <dt className="text-slate-500">Full name</dt>
        <dd>{row.fullName}</dd>
        <dt className="text-slate-500">Document number</dt>
        <dd className="font-mono">{row.documentNumber}</dd>
        <dt className="text-slate-500">Assignee</dt>
        <dd className="font-mono">{row.assignee ?? "-"}</dd>
        <dt className="text-slate-500">Decision note</dt>
        <dd>{row.decisionNote ?? "-"}</dd>
        <dt className="text-slate-500">Updated (UTC)</dt>
        <dd className="font-mono text-xs">{row.updatedAt}</dd>
      </dl>

      {canClaim && (
        <form action={claimAction} className="flex items-center gap-3 rounded border border-slate-200 bg-white p-4">
          <input type="hidden" name="id" value={row.id} />
          <span className="text-sm text-slate-600">This case is unclaimed.</span>
          <button type="submit" className={primaryButton}>
            Claim
          </button>
        </form>
      )}

      {(canApprove || canReject) && (
        <form action={decideCaseAction} className="space-y-3 rounded border border-slate-200 bg-white p-4">
          <input type="hidden" name="id" value={row.id} />
          <label htmlFor="note" className="block text-sm font-medium">
            Decision note
          </label>
          <textarea id="note" name="note" required rows={3} className={inputClass} placeholder="Why this case is approved or rejected" />
          {row.riskTier === "high" && (
            <p className="text-xs text-slate-500">High risk: approving opens a request that an approver must decide before the case is approved.</p>
          )}
          <div className="flex gap-2">
            {canApprove && (
              <button type="submit" name="decision" value="approved" className={primaryButton}>
                Approve
              </button>
            )}
            {canReject && (
              <button type="submit" name="decision" value="rejected" className={dangerButton}>
                Reject
              </button>
            )}
          </div>
        </form>
      )}

      {pending && (
        <div className="space-y-3 rounded border border-amber-200 bg-amber-50 p-4 text-sm">
          <p>
            Waiting for approval #{pending.id}: requested by <span className="font-mono">{pending.requestedBy}</span>, requires{" "}
            <span className="font-medium">{pending.requiredRole}</span>.
          </p>
          {canDecideApproval ? (
            <form action={decideApprovalAction} className="space-y-3">
              <input type="hidden" name="id" value={row.id} />
              <input type="hidden" name="approvalId" value={pending.id} />
              <label htmlFor="approval-note" className="block font-medium">
                Approver note
              </label>
              <textarea id="approval-note" name="note" required rows={2} className={inputClass} />
              <div className="flex gap-2">
                <button type="submit" name="decision" value="approved" className={primaryButton}>
                  Approve request
                </button>
                <button type="submit" name="decision" value="rejected" className={dangerButton}>
                  Reject request
                </button>
              </div>
            </form>
          ) : (
            <p className="text-slate-600">
              {pending.requestedBy === user!.id ? "You requested this approval and cannot decide it." : "Only an approver can decide this request."}
            </p>
          )}
        </div>
      )}

      {approvals.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-medium">Approvals</h2>
          <div className="overflow-x-auto rounded border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Requested by</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Decided by</th>
                  <th className="px-3 py-2">Note</th>
                  <th className="px-3 py-2">Decided (UTC)</th>
                </tr>
              </thead>
              <tbody>
                {approvals.map((a) => (
                  <tr key={a.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-mono text-xs">{a.id}</td>
                    <td className="px-3 py-2 font-mono text-xs">{a.requestedBy}</td>
                    <td className="px-3 py-2">
                      <CaseStatusBadge status={a.status} />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{a.decidedBy ?? "-"}</td>
                    <td className="px-3 py-2">{a.note ?? "-"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{a.decidedAt ?? "-"}</td>
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
