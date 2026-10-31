import { describe, expect, it, vi } from "vitest";
import { switchUser } from "@/platform/auth-actions";

vi.mock("next/headers", () => ({ cookies: async () => ({ set: vi.fn() }) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error(`redirect:${url}`); },
}));

describe("safeReturnTo through the dev switcher", () => {
  it.each([
    "/\\evil.com", "//evil.com", "/path\\evil.com", "https://evil.com", "http://evil.com",
    "javascript:alert(1)", "kyc/kyc_001", "?next=/kyc", "#kyc", " //evil.com", "/\t/evil.com", "/\n/evil.com", "",
  ])("returns / for unsafe return path %j", async (returnTo) => {
    const form = new FormData();
    form.set("userId", "u_jordan");
    form.set("returnTo", returnTo);
    await expect(switchUser(form)).rejects.toThrow(/^redirect:\/$/);
  });

  it.each(["/", "/kyc/kyc_001", "/audit?app=kyc#events"])("keeps same-origin path %j", async (returnTo) => {
    const form = new FormData();
    form.set("userId", "u_jordan");
    form.set("returnTo", returnTo);
    await expect(switchUser(form)).rejects.toThrow(`redirect:${returnTo}`);
  });

  it("defaults a missing return path to /", async () => {
    const form = new FormData();
    form.set("userId", "u_jordan");
    await expect(switchUser(form)).rejects.toThrow(/^redirect:\/$/);
  });
});
