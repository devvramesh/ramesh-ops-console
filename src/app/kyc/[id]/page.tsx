import Link from "next/link";
import { notFound } from "next/navigation";
import { claimAction, decideApprovalAction, decideCaseAction } from "@/apps/kyc/actions";
import { kycPolicy } from "@/apps/kyc/policy";
import { caseApprovals, caseAudit, getCase } from "@/apps/kyc/service";
import { AuditTable } from "@/components/AuditTable";
import { DataTable } from "@/components/fluent/DataTable";
import { FButton, FTextarea } from "@/components/fluent/fields";
import { Notice } from "@/components/fluent/Notice";
import { formatDateTime } from "@/components/labels";
import { recordAccess } from "@/platform/audit";
import { getSession } from "@/platform/auth";
import { can } from "@/platform/rbac";
import { CaseStatusBadge, RiskBadge } from "../ui";

const quiet = "font-mono text-xs text-neutral-500";
const card = "rounded border border-neutral-200 bg-white p-4";

export default async function KycCasePage({ params, searchParams }: PageProps<"/kyc/[id]">) {
  const user = await getSession();
  if (!can(user, kycPolicy.app, "read")) {
    return (
      <Notice intent="error">
        {user ? `${user.name} may not read KYC cases. Requires analyst, approver, or auditor.` : "Sign in to read KYC cases."}
      </Notice>
    );
  }

  const { id } = await params;
  const { error } = await searchParams;
  const row = getCase(user, id);
  if (!row) notFound();
  recordAccess(user, { app: kycPolicy.app, action: "read_pii", entityId: id });

  const approvals = caseApprovals(user, id);
  const pending = approvals.find((a) => a.status === "pending");
  const events = caseAudit(user, id);

  const canClaim = row.status === "new" && can(user, kycPolicy.app, "claim");
  const isAssignee = row.assignee === user!.id;
  const canApprove = row.status === "in_review" && isAssignee && !pending && can(user, kycPolicy.app, "approve");
  const canReject = row.status === "in_review" && isAssignee && !pending && can(user, kycPolicy.app, "reject");
  const canDecideApproval = !!pending && pending.requestedBy !== user!.id && user!.roles.includes(kycPolicy.approval!.requiredRole);

  const fields: [string, React.ReactNode][] = [
    ["Subject", <span key="v" className={quiet}>{row.subjectRef}</span>],
    ["Full name", row.fullName],
    ["Document number", <span key="v" className={quiet}>{row.documentNumber}</span>],
    ["Assignee", <span key="v" className={quiet}>{row.assignee ?? "-"}</span>],
    ["Decision note", row.decisionNote ?? "-"],
    ["Updated", formatDateTime(row.updatedAt)],
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/kyc" className="text-sm text-neutral-500 hover:text-neutral-900">
          &larr; KYC review queue
        </Link>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="font-mono text-lg text-neutral-600">{row.id}</h1>
          <CaseStatusBadge status={row.status} />
          <RiskBadge tier={row.riskTier} />
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

      {canClaim && (
        <form action={claimAction} className={`flex items-center gap-3 ${card}`}>
          <input type="hidden" name="id" value={row.id} />
          <span className="text-sm text-neutral-600">This case is unclaimed.</span>
          <FButton type="submit" appearance="primary">
            Claim
          </FButton>
        </form>
      )}

      {(canApprove || canReject) && (
        <form action={decideCaseAction} className={`space-y-3 ${card}`}>
          <input type="hidden" name="id" value={row.id} />
          <label htmlFor="note" className="block text-sm font-medium">
            Decision note
          </label>
          <FTextarea id="note" name="note" required rows={3} className="w-full" placeholder="Why this case is approved or rejected" />
          {row.riskTier === "high" && (
            <p className="text-xs text-neutral-500">
              High risk: approving opens a request that an approver must decide before the case is approved.
            </p>
          )}
          <div className="flex gap-2">
            {canApprove && (
              <FButton type="submit" name="decision" value="approved" appearance="primary">
                Approve
              </FButton>
            )}
            {canReject && (
              <FButton type="submit" name="decision" value="rejected" appearance="outline">
                Reject
              </FButton>
            )}
          </div>
        </form>
      )}

      {pending && (
        <div className="space-y-3 rounded border border-amber-200 bg-amber-50 p-4 text-sm">
          <p>
            Waiting for approval #{pending.id}: requested by <span className={quiet}>{pending.requestedBy}</span>, requires{" "}
            <span className="font-medium">{pending.requiredRole}</span>.
          </p>
          {canDecideApproval ? (
            <form action={decideApprovalAction} className="space-y-3">
              <input type="hidden" name="id" value={row.id} />
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
              <CaseStatusBadge key="s" status={a.status} />,
              <span key="d" className={quiet}>
                {a.decidedBy ?? "-"}
              </span>,
              a.note ?? "-",
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
