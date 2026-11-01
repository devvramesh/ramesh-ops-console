import Link from "next/link";
import { createFlagAction } from "@/apps/flags/actions";
import { flagsPolicy } from "@/apps/flags/policy";
import { FButton, FInput, FSelect, FTextarea } from "@/components/fluent/fields";
import { Notice } from "@/components/fluent/Notice";
import { getSession } from "@/platform/auth";
import { can } from "@/platform/rbac";

export default async function NewFlagPage({ searchParams }: PageProps<"/flags/new">) {
  const user = await getSession();
  if (!can(user, flagsPolicy.app, "create")) {
    return (
      <Notice intent="error">
        {user ? `${user.name} may not create feature flags. Requires admin.` : "Sign in to create a feature flag."}
      </Notice>
    );
  }
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;

  return (
    <div className="max-w-lg space-y-4">
      <div>
        <Link href="/flags" className="text-sm text-neutral-500 hover:text-neutral-900">
          &larr; Feature flags
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">New flag</h1>
        <p className="mt-1 text-sm text-neutral-600">New flags start off. Turn one on from its page.</p>
      </div>
      {error && <Notice intent="error">{error}</Notice>}
      <form action={createFlagAction} className="space-y-3 rounded border border-neutral-200 bg-white p-4">
        <div>
          <label htmlFor="key" className="block text-sm font-medium">
            Key
          </label>
          <FInput id="key" name="key" required maxLength={64} placeholder="new_checkout_flow" className="w-full" />
        </div>
        <div>
          <label htmlFor="description" className="block text-sm font-medium">
            Description
          </label>
          <FInput id="description" name="description" required maxLength={200} className="w-full" />
        </div>
        <div>
          <label htmlFor="risk" className="block text-sm font-medium">
            Risk
          </label>
          <FSelect id="risk" name="risk" defaultValue="low">
            <option value="low">Low</option>
            <option value="high">High</option>
          </FSelect>
        </div>
        <div>
          <label htmlFor="ownerNote" className="block text-sm font-medium">
            Owner note
          </label>
          <FTextarea id="ownerNote" name="ownerNote" maxLength={500} rows={2} className="w-full" />
        </div>
        <FButton type="submit" appearance="primary">
          Create flag
        </FButton>
      </form>
    </div>
  );
}
