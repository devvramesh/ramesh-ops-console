import type { AppPolicy } from "@/platform/rbac";

/** Refunds above this amount need a second person. At or under it they are approved automatically. */
export const APPROVAL_THRESHOLD_CENTS = 50000;
export const MAX_AMOUNT_CENTS = 10_000_000;

export const refundsPolicy: AppPolicy = {
  app: "refunds",
  title: "Refunds",
  description: "Customer refunds. Support requests, an approver decides anything over $500, admin pays.",
  permissions: {
    read: ["support", "approver", "auditor", "admin"],
    create: ["support"],
    approve: ["approver"],
    reject: ["approver"],
    pay: ["admin"],
  },
  pii: ["customer_email"],
  approval: {
    requiredRole: "approver",
    rule: "Refunds over 50000 cents need an approver who is not the requester",
    thresholdCents: APPROVAL_THRESHOLD_CENTS,
  },
};
