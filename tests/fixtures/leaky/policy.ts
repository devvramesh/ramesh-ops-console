import type { AppPolicy } from "@/platform/rbac";

export const leakyPolicy: AppPolicy = {
  app: "leaky",
  title: "Leaky fixture",
  description: "Deliberately violating app used to test tests/contract.test.ts.",
  permissions: { read: ["auditor"], create: ["admin"] },
  // VIOLATION: `member_ssn` is a real PII column left undeclared.
  pii: [],
};
