export function maskName(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.map((p) => `${p[0] ?? ""}***`).join(" ");
}

export function maskDocument(doc: string) {
  return doc.length <= 4 ? "****" : `${"*".repeat(doc.length - 4)}${doc.slice(-4)}`;
}

const riskClass: Record<string, string> = {
  low: "bg-green-100 text-green-800",
  medium: "bg-amber-100 text-amber-800",
  high: "bg-red-100 text-red-800",
};

export function RiskBadge({ tier }: { tier: string }) {
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${riskClass[tier] ?? "bg-slate-100 text-slate-800"}`}>{tier}</span>;
}

const statusClass: Record<string, string> = {
  new: "bg-slate-100 text-slate-800",
  in_review: "bg-blue-100 text-blue-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  pending: "bg-amber-100 text-amber-800",
};

export function CaseStatusBadge({ status }: { status: string }) {
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${statusClass[status] ?? "bg-slate-100 text-slate-800"}`}>{status}</span>;
}
