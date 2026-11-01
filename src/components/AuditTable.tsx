import { formatDateTime } from "@/components/labels";
import { DataTable } from "@/components/fluent/DataTable";
import { StatusPill } from "@/components/fluent/StatusPill";
import type { AuditEvent } from "@/platform/db/schema";

const quiet = "font-mono text-xs text-neutral-500";

export function AuditTable({ events, showApp = true }: { events: AuditEvent[]; showApp?: boolean }) {
  if (events.length === 0) return <p className="text-sm text-neutral-500">No audit events.</p>;
  const columns = ["Time", "Actor", "Role", ...(showApp ? ["App"] : []), "Action", "Entity", "Outcome", "Before", "After"];
  const rows = events.map((e) => [
    <span key="t" className="whitespace-nowrap text-neutral-600">
      {formatDateTime(e.ts)}
    </span>,
    <span key="a" className={quiet}>
      {e.actorId}
    </span>,
    e.actorRole ?? "-",
    ...(showApp ? [e.app] : []),
    e.action,
    <span key="e" className={quiet}>
      {e.entityId ?? "-"}
    </span>,
    <StatusPill key="o" status={e.outcome} />,
    <pre key="b" className="max-w-xs whitespace-pre-wrap break-all font-mono text-xs text-neutral-600">
      {e.beforeJson ?? "-"}
    </pre>,
    <pre key="j" className="max-w-xs whitespace-pre-wrap break-all font-mono text-xs text-neutral-600">
      {e.afterJson ?? "-"}
    </pre>,
  ]);
  return <DataTable columns={columns} rows={rows} />;
}
