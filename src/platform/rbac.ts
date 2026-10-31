import { apps } from "@/apps/registry";

export const ROLES = ["support", "analyst", "approver", "auditor", "admin"] as const;
export type Role = (typeof ROLES)[number];

export type SessionUser = { id: string; name: string; roles: Role[] };

export type AppPolicy = {
  /** URL segment, audit key, and registry key. Pages live under src/app/<app>/. */
  app: string;
  title: string;
  description: string;
  /** action -> roles allowed. An action not listed here is denied for everyone, admin included. */
  permissions: Record<string, Role[]>;
  /** Column names whose values are replaced with "[redacted]" in audit JSON. */
  pii: string[];
  /** Describes when a write needs a second person. The check itself lives in service.ts. */
  approval?: { requiredRole: Role; rule: string; thresholdCents?: number };
};

const platformPolicies: Record<string, AppPolicy> = {
  audit: {
    app: "audit",
    title: "Audit log",
    description: "Every write and every denied attempt, across all apps.",
    permissions: { read: ["auditor", "admin"] },
    pii: [],
  },
};

export function getPolicy(app: string): AppPolicy | undefined {
  return platformPolicies[app] ?? apps.find((a) => a.policy.app === app)?.policy;
}

/** The first of the user's roles that the policy allows for this action, or null. */
export function authorizingRole(user: SessionUser | null | undefined, app: string, action: string): Role | null {
  if (!user) return null;
  const allowed = getPolicy(app)?.permissions[action];
  if (!allowed) return null;
  return user.roles.find((r) => allowed.includes(r)) ?? null;
}

export function can(user: SessionUser | null | undefined, app: string, action: string): boolean {
  return authorizingRole(user, app, action) !== null;
}
