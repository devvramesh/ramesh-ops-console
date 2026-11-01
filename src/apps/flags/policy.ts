import type { AppPolicy } from "@/platform/rbac";

export const flagsPolicy: AppPolicy = {
  app: "flags",
  title: "Feature flags",
  description: "Admins create flags and turn them off at any time. Turning a high-risk flag on needs an approver.",
  permissions: {
    read: ["admin", "approver", "auditor"],
    create: ["admin"],
    enable: ["admin"],
    disable: ["admin"],
  },
  pii: ["owner_note"],
  approval: { requiredRole: "approver", rule: "turning a high-risk flag on needs an approver other than the requester" },
};
