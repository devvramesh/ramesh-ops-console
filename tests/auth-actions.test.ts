import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encodeSession, SESSION_COOKIE, sessionCookieOptions } from "@/platform/auth";
import { switchUser } from "@/platform/auth-actions";

const { setCookie, deleteCookie } = vi.hoisted(() => ({ setCookie: vi.fn(), deleteCookie: vi.fn() }));

vi.mock("next/headers", () => ({ cookies: async () => ({ set: setCookie, delete: deleteCookie }) }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`redirect:${url}`); }),
}));

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllEnvs());

describe("dev switcher user validation", () => {
  it.each([null, "", "   ", "u_missing"])("leaves the session unchanged for user ID %j", async (userId) => {
    const form = new FormData();
    if (userId !== null) form.set("userId", userId);
    form.set("returnTo", "/kyc");

    await expect(switchUser(form)).resolves.toBeUndefined();
    expect(setCookie).not.toHaveBeenCalled();
    expect(deleteCookie).not.toHaveBeenCalled();
  });

  it("ignores a file submitted instead of a user ID", async () => {
    const form = new FormData();
    form.set("userId", new File(["u_jordan"], "user.txt"));

    await expect(switchUser(form)).resolves.toBeUndefined();
    expect(setCookie).not.toHaveBeenCalled();
    expect(deleteCookie).not.toHaveBeenCalled();
  });

  it("sets a signed session cookie and redirects for a valid user", async () => {
    const form = new FormData();
    form.set("userId", "u_jordan");
    form.set("returnTo", "/kyc");

    await expect(switchUser(form)).rejects.toThrow(/^redirect:\/kyc$/);
    expect(setCookie).toHaveBeenCalledExactlyOnceWith(SESSION_COOKIE, encodeSession("u_jordan"), sessionCookieOptions());
    expect(deleteCookie).not.toHaveBeenCalled();
  });

  it.each([["oidc", "test"], ["dev", "production"]])("stays disabled for AUTH_MODE=%s and NODE_ENV=%s", async (authMode, nodeEnv) => {
    vi.stubEnv("AUTH_MODE", authMode);
    vi.stubEnv("NODE_ENV", nodeEnv);

    await expect(switchUser(new FormData())).rejects.toThrow("dev sign-in is disabled");
    expect(setCookie).not.toHaveBeenCalled();
    expect(deleteCookie).not.toHaveBeenCalled();
  });
});

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
