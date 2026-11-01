"use client";

import { Badge } from "@fluentui/react-components";
import { statusLabel } from "../labels";

type Tone = "brand" | "danger" | "important" | "informative" | "severe" | "subtle" | "success" | "warning";

const TONES: Record<string, Tone> = {
  new: "informative",
  pending: "warning",
  pending_approval: "warning",
  in_review: "brand",
  approved: "success",
  rejected: "danger",
  paid: "success",
  denied: "danger",
  ok: "success",
  low: "success",
  medium: "warning",
  high: "severe",
  on: "success",
};

export function StatusPill({ status }: { status: string }) {
  return (
    <Badge appearance="filled" color={TONES[status] ?? "subtle"} shape="rounded" size="small">
      {statusLabel(status)}
    </Badge>
  );
}
