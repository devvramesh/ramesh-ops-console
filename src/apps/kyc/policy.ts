import type { AppPolicy } from "@/platform/rbac";

export const kycPolicy: AppPolicy = {
  app: "kyc",
  title: "KYC review queue",
  description: "Identity verification cases. Analysts claim and decide; high-risk approvals need an approver.",
  permissions: {
    read: ["analyst", "approver", "auditor"],
    read_pii: ["analyst", "approver", "auditor"],
    claim: ["analyst"],
    approve: ["analyst"],
    reject: ["analyst"],
  },
  pii: ["full_name", "document_number"],
  approval: { requiredRole: "approver", rule: "approving a high-risk case needs an approver other than the analyst" },
};
