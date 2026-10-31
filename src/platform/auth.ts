import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "./db/client";
import { userRoles, users } from "./db/schema";
import type { Role, SessionUser } from "./rbac";

export type { SessionUser };

export const SESSION_COOKIE = "ops_session";

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set");
  return s;
}

function sign(userId: string) {
  return createHmac("sha256", secret()).update(userId).digest("base64url");
}

/** Cookie value: "<userId>.<hmac>". The cookie holds nothing else; roles come from the database. */
export function encodeSession(userId: string) {
  return `${userId}.${sign(userId)}`;
}

export function decodeSession(value: string | undefined): string | null {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot < 1) return null;
  const userId = value.slice(0, dot);
  const given = Buffer.from(value.slice(dot + 1));
  const expected = Buffer.from(sign(userId));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return userId;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
}

export function loadUser(userId: string): SessionUser | null {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) return null;
  const roles = db
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.userId, userId))
    .all()
    .map((r) => r.role as Role);
  return { id: user.id, name: user.name, roles };
}

export function listUsers(): SessionUser[] {
  return db
    .select()
    .from(users)
    .orderBy(users.id)
    .all()
    .map((u) => loadUser(u.id)!)
    .filter(Boolean);
}

/** Reads the signed cookie and loads the user and roles from the database on every request. */
export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const userId = decodeSession(store.get(SESSION_COOKIE)?.value);
  return userId ? loadUser(userId) : null;
}

// OIDC (Entra ID or Okta) plugs in here: verify the provider's id_token in a callback route, map it to users.id, then set the same cookie with encodeSession().

/** The "sign in as" switcher only works in dev mode outside production. */
export function devSwitcherEnabled() {
  return process.env.AUTH_MODE === "dev" && process.env.NODE_ENV !== "production";
}
