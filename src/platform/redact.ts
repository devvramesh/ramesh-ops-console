import { getPolicy } from "./rbac";

export const REDACTED = "[redacted]";

function camel(name: string) {
  return name.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

/** Field names the policy marks as PII, in both snake_case and camelCase. */
export function piiFields(app: string): Set<string> {
  const out = new Set<string>();
  for (const f of getPolicy(app)?.pii ?? []) {
    out.add(f);
    out.add(camel(f));
  }
  return out;
}

export function redact(app: string, row: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (row == null) return null;
  const pii = piiFields(app);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = pii.has(k) && v != null ? REDACTED : v;
  }
  return out;
}
