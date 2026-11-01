const STATUS_LABELS: Record<string, string> = {
  new: "New",
  pending: "Pending",
  pending_approval: "Pending approval",
  in_review: "In review",
  approved: "Approved",
  rejected: "Rejected",
  paid: "Paid",
  denied: "Denied",
  ok: "OK",
};

/** "pending_approval" -> "Pending approval". Unknown statuses are humanized. */
export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

const DATE_TIME = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "UTC",
});

/** ISO 8601 -> "Oct 18, 2026, 6:25 PM UTC". The zone is shown so it can't read as local time. */
export function formatDateTime(iso: string): string {
  return `${DATE_TIME.format(new Date(iso))} UTC`;
}
