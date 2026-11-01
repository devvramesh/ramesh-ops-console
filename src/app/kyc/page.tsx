import Link from "next/link";
import { kycPolicy } from "@/apps/kyc/policy";
import { CASE_STATUSES } from "@/apps/kyc/schema";
import { listCases } from "@/apps/kyc/service";
import { CommandBar } from "@/components/fluent/CommandBar";
import { DataTable } from "@/components/fluent/DataTable";
import { FButton, FSelect } from "@/components/fluent/fields";
import { Notice } from "@/components/fluent/Notice";
import { statusLabel } from "@/components/labels";
import { getSession } from "@/platform/auth";
import { can } from "@/platform/rbac";
import { CaseStatusBadge, maskDocument, maskName, RiskBadge } from "./ui";

const quietId = "font-mono text-xs text-neutral-500";

export default async function KycListPage({ searchParams }: PageProps<"/kyc">) {
  const user = await getSession();
  if (!can(user, kycPolicy.app, "read")) {
    return (
      <Notice intent="error">
        {user ? `${user.name} may not read the KYC queue. Requires analyst, approver, or auditor.` : "Sign in to read the KYC queue."}
      </Notice>
    );
  }

  const params = await searchParams;
  const status = typeof params.status === "string" && (CASE_STATUSES as readonly string[]).includes(params.status) ? params.status : "";
  const cases = listCases(user, status ? { status } : {});

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">{kycPolicy.title}</h1>
        <p className="mt-1 text-sm text-neutral-600">Names and document numbers are masked here. Open a case to see them.</p>
      </div>
      <CommandBar>
        <form method="get" className="flex items-center gap-2">
          <label htmlFor="status-filter" className="text-sm text-neutral-600">
            Status
          </label>
          <FSelect id="status-filter" name="status" defaultValue={status} size="small">
            <option value="">all</option>
            {CASE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </FSelect>
          <FButton type="submit" size="small" appearance="subtle">
            Filter
          </FButton>
        </form>
      </CommandBar>
      {cases.length === 0 ? (
        <p className="text-sm text-neutral-500">No cases.</p>
      ) : (
        <DataTable
          columns={["Case", "Subject", "Name", "Document", "Risk", "Status", "Assignee"]}
          rows={cases.map((c) => [
            <Link key="id" href={`/kyc/${c.id}`} className={quietId}>
              {c.id}
            </Link>,
            <span key="s" className={quietId}>
              {c.subjectRef}
            </span>,
            maskName(c.fullName),
            <span key="d" className={quietId}>
              {maskDocument(c.documentNumber)}
            </span>,
            <RiskBadge key="r" tier={c.riskTier} />,
            <CaseStatusBadge key="st" status={c.status} />,
            <span key="a" className={quietId}>
              {c.assignee ?? "-"}
            </span>,
          ])}
        />
      )}
    </div>
  );
}
