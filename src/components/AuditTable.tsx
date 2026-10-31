import type { AuditEvent } from "@/platform/db/schema";

export function AuditTable({ events, showApp = true }: { events: AuditEvent[]; showApp?: boolean }) {
  if (events.length === 0) return <p className="text-sm text-slate-500">No audit events.</p>;
  return (
    <div className="overflow-x-auto rounded border border-slate-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2">Time (UTC)</th>
            <th className="px-3 py-2">Actor</th>
            <th className="px-3 py-2">Role</th>
            {showApp && <th className="px-3 py-2">App</th>}
            <th className="px-3 py-2">Action</th>
            <th className="px-3 py-2">Entity</th>
            <th className="px-3 py-2">Outcome</th>
            <th className="px-3 py-2">Before</th>
            <th className="px-3 py-2">After</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id} className="border-t border-slate-100 align-top">
              <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{e.ts}</td>
              <td className="px-3 py-2 font-mono text-xs">{e.actorId}</td>
              <td className="px-3 py-2">{e.actorRole ?? "-"}</td>
              {showApp && <td className="px-3 py-2">{e.app}</td>}
              <td className="px-3 py-2">{e.action}</td>
              <td className="px-3 py-2 font-mono text-xs">{e.entityId ?? "-"}</td>
              <td className="px-3 py-2">
                <span
                  className={
                    e.outcome === "denied"
                      ? "rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800"
                      : "rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800"
                  }
                >
                  {e.outcome}
                </span>
              </td>
              <td className="max-w-xs px-3 py-2">
                <pre className="whitespace-pre-wrap break-all font-mono text-xs text-slate-600">{e.beforeJson ?? "-"}</pre>
              </td>
              <td className="max-w-xs px-3 py-2">
                <pre className="whitespace-pre-wrap break-all font-mono text-xs text-slate-600">{e.afterJson ?? "-"}</pre>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
