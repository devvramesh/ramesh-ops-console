"use client";

import { usePathname } from "next/navigation";
import { signOut, switchUser } from "@/platform/auth-actions";
import type { SessionUser } from "@/platform/rbac";

export function UserSwitcher({ users, currentUserId }: { users: SessionUser[]; currentUserId: string }) {
  const pathname = usePathname();
  return (
    <form action={switchUser} className="flex items-center gap-2">
      <input type="hidden" name="returnTo" value={pathname} />
      <label htmlFor="switch-user" className="text-xs uppercase tracking-wide text-slate-500">
        Sign in as
      </label>
      <select
        id="switch-user"
        name="userId"
        defaultValue={currentUserId}
        className="rounded border border-slate-300 bg-white px-2 py-1 text-sm"
      >
        <option value="" disabled>
          choose a user
        </option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name} ({u.roles.join(", ")})
          </option>
        ))}
      </select>
      <button type="submit" className="rounded bg-slate-900 px-3 py-1 text-sm text-white hover:bg-slate-700">
        Switch
      </button>
      {currentUserId && (
        <button type="submit" formAction={signOut} className="text-sm text-slate-500 hover:text-slate-900">
          Sign out
        </button>
      )}
    </form>
  );
}
