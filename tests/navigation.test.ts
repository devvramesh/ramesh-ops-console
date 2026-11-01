import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { NavRail } from "@/components/fluent/NavRail";

const route = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));
vi.mock("@/platform/auth-actions", () => ({ switchUser: vi.fn(), signOut: vi.fn() }));

const items = [
  { href: "/", label: "Home" },
  { href: "/refunds", label: "Refunds" },
  { href: "/kyc", label: "KYC" },
  { href: "/audit", label: "Audit" },
];

function render(pathname: string) {
  route.pathname = pathname;
  return renderToStaticMarkup(createElement(NavRail, { items, user: null, users: [], devSwitcher: false }));
}

describe("sidebar navigation", () => {
  it("separates the signed-in name, readable roles, and Demo control", () => {
    const user = { id: "riley", name: "Riley", roles: ["approver", "support"] as const };
    const html = renderToStaticMarkup(createElement(NavRail, {
      items,
      user: { ...user, roles: [...user.roles] },
      users: [],
      devSwitcher: true,
    }));
    expect(html).toContain("flex min-w-0 flex-1 flex-col gap-1");
    expect(html).toMatch(/Riley<\/span>/);
    expect(html).toContain("Approver · Support</span>");
    expect(html).toContain('class="shrink-0"');
    expect(html).toContain("Demo");
  });

  it.each([
    ["/", "/"],
    ["/refunds", "/refunds"],
    ["/refunds/new", "/refunds"],
    ["/refunds/rf_seed_0001", "/refunds"],
    ["/kyc/kyc_001", "/kyc"],
    ["/audit", "/audit"],
  ])("marks only %s's current section %s", (pathname, href) => {
    const current = render(pathname).match(/<a\b[^>]*aria-current="page"[^>]*>/g) ?? [];
    expect(current).toHaveLength(1);
    expect(current[0]).toContain(`href="${href}"`);
  });

  it("does not select a section just because its name is a path prefix", () => {
    expect(render("/refunds-archive")).not.toContain('aria-current="page"');
  });

  it("left-aligns each navigation label and omits the divider", () => {
    const html = render("/refunds");
    expect(html.match(/style="justify-content:flex-start/g)).toHaveLength(items.length);
    expect(html).not.toContain('role="separator"');
  });
});
