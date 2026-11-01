"use client";

import {
  Button,
  Caption1,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  Text,
  tokens,
} from "@fluentui/react-components";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, switchUser } from "@/platform/auth-actions";
import type { SessionUser } from "@/platform/rbac";

export type NavItem = { href: string; label: string };

function DemoMenu({ users, currentUserId }: { users: SessionUser[]; currentUserId: string }) {
  const pathname = usePathname();
  return (
    <Menu>
      <MenuTrigger disableButtonEnhancement>
        <Button size="small" appearance="subtle">
          Demo
        </Button>
      </MenuTrigger>
      <MenuPopover>
        <MenuList>
          {users.map((u) => (
            <MenuItem
              key={u.id}
              onClick={() => {
                const fd = new FormData();
                fd.set("userId", u.id);
                fd.set("returnTo", pathname);
                void switchUser(fd);
              }}
            >
              {u.name} ({u.roles.join(", ")}){u.id === currentUserId ? " ✓" : ""}
            </MenuItem>
          ))}
          {currentUserId && (
            <MenuItem onClick={() => void signOut()}>Sign out</MenuItem>
          )}
        </MenuList>
      </MenuPopover>
    </Menu>
  );
}

export function NavRail({
  items,
  user,
  users,
  devSwitcher,
}: {
  items: NavItem[];
  user: SessionUser | null;
  users: SessionUser[];
  devSwitcher: boolean;
}) {
  const pathname = usePathname();
  return (
    <nav className="flex w-52 shrink-0 flex-col border-r border-neutral-200 bg-white">
      <div className="px-4 py-4">
        <Text weight="semibold" size={400}>
          Ops Console
        </Text>
      </div>
      <div className="flex flex-1 flex-col gap-0.5 px-2">
        {items.map((item) => {
          const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`));
          return (
            <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className="no-underline">
              <Button
                appearance="subtle"
                className="w-full"
                style={{
                  justifyContent: "flex-start",
                  backgroundColor: active ? tokens.colorNeutralBackground1Selected : undefined,
                  color: active ? tokens.colorBrandForeground1 : undefined,
                  fontWeight: active ? tokens.fontWeightSemibold : undefined,
                }}
              >
                {item.label}
              </Button>
            </Link>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-2 px-3 py-3">
        {user ? (
          <div className="min-w-0">
            <Text size={200} className="block truncate">
              {user.name}
            </Text>
            <Caption1 className="block truncate text-neutral-500">{user.roles.join(", ")}</Caption1>
          </div>
        ) : (
          <Caption1 className="text-neutral-500">Not signed in</Caption1>
        )}
        {devSwitcher && <DemoMenu users={users} currentUserId={user?.id ?? ""} />}
      </div>
    </nav>
  );
}
