"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { devSwitcherEnabled, encodeSession, loadUser, SESSION_COOKIE, sessionCookieOptions } from "./auth";

function safeReturnTo(value: FormDataEntryValue | null) {
  const s = typeof value === "string" ? value : "/";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/";
}

export async function switchUser(formData: FormData) {
  if (!devSwitcherEnabled()) throw new Error("dev sign-in is disabled: requires AUTH_MODE=dev and NODE_ENV != production");
  const userId = String(formData.get("userId") ?? "");
  if (!loadUser(userId)) throw new Error(`unknown user id ${userId}`);
  (await cookies()).set(SESSION_COOKIE, encodeSession(userId), sessionCookieOptions());
  redirect(safeReturnTo(formData.get("returnTo")));
}

export async function signOut() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/");
}
