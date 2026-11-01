import { StatusPill } from "@/components/fluent/StatusPill";

export function maskName(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.map((p) => `${p[0] ?? ""}***`).join(" ");
}

export function maskDocument(doc: string) {
  return doc.length <= 4 ? "****" : `${"*".repeat(doc.length - 4)}${doc.slice(-4)}`;
}

export function RiskBadge({ tier }: { tier: string }) {
  return <StatusPill status={tier} />;
}

export function CaseStatusBadge({ status }: { status: string }) {
  return <StatusPill status={status} />;
}
