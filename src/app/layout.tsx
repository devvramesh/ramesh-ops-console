import type { Metadata } from "next";
import Link from "next/link";
import { apps } from "@/apps/registry";
import { UserSwitcher } from "@/components/UserSwitcher";
import { devSwitcherEnabled, getSession, listUsers } from "@/platform/auth";
import { can } from "@/platform/rbac";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ops Console",
  description: "Internal tools prototype",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await getSession();
  const readable = apps.filter((a) => can(user, a.policy.app, "read"));
  const showAudit = can(user, "audit", "read");
  const switcher = devSwitcherEnabled();

  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-3">
            <nav className="flex items-center gap-5 text-sm">
              <Link href="/" className="font-semibold text-slate-900">
                Ops Console
              </Link>
              {readable.map((a) => (
                <Link key={a.policy.app} href={`/${a.policy.app}`} className="text-slate-600 hover:text-slate-900">
                  {a.policy.title}
                </Link>
              ))}
              {showAudit && (
                <Link href="/audit" className="text-slate-600 hover:text-slate-900">
                  Audit
                </Link>
              )}
            </nav>
            <div className="flex items-center gap-3 text-sm">
              {user ? (
                <span className="text-slate-700">
                  <span className="font-medium">{user.name}</span>{" "}
                  <span className="text-slate-500">({user.roles.join(", ")})</span>
                </span>
              ) : (
                <span className="text-slate-500">Not signed in</span>
              )}
              {switcher && <UserSwitcher users={listUsers()} currentUserId={user?.id ?? ""} />}
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
