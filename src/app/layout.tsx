import type { Metadata } from "next";
import { apps } from "@/apps/registry";
import { NavRail, type NavItem } from "@/components/fluent/NavRail";
import { Provider } from "@/components/fluent/Provider";
import { devSwitcherEnabled, getSession, listUsers } from "@/platform/auth";
import { can } from "@/platform/rbac";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ops Console",
  description: "Internal tools prototype",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await getSession();
  const items: NavItem[] = [
    { href: "/", label: "Home" },
    ...apps.filter((a) => can(user, a.policy.app, "read")).map((a) => ({ href: `/${a.policy.app}`, label: a.policy.title })),
  ];
  if (can(user, "audit", "read")) items.push({ href: "/audit", label: "Audit" });

  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        <Provider>
          <div className="flex min-h-screen">
            <NavRail items={items} user={user} users={devSwitcherEnabled() ? listUsers() : []} devSwitcher={devSwitcherEnabled()} />
            <main className="min-w-0 flex-1 px-8 py-6">{children}</main>
          </div>
        </Provider>
      </body>
    </html>
  );
}
