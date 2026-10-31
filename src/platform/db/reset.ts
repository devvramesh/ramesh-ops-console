import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadEnv } from "../env";

export const DEFAULT_SESSION_SECRET = "change-me-to-a-long-random-string";

/**
 * .env.example ships a placeholder SESSION_SECRET; a verbatim `cp` leaves every
 * deployment signing session cookies with the same public key. When db:reset
 * sees the placeholder in .env.local it writes a real random secret over it.
 */
export function ensureSessionSecret(envPath = ".env.local"): boolean {
  if (!existsSync(envPath)) return false;
  const text = readFileSync(envPath, "utf8");
  if (!text.includes(`SESSION_SECRET=${DEFAULT_SESSION_SECRET}`)) return false;
  writeFileSync(envPath, text.replace(`SESSION_SECRET=${DEFAULT_SESSION_SECRET}`, `SESSION_SECRET=${randomBytes(32).toString("hex")}`));
  return true;
}

// Used by `npm run db:reset` and by tests/setup.ts.
export async function resetDatabase() {
  loadEnv();
  const file = path.resolve(process.cwd(), process.env.DATABASE_FILE ?? "data/app.sqlite");
  process.env.DATABASE_FILE = file;

  for (const suffix of ["", "-wal", "-shm"]) rmSync(file + suffix, { force: true });
  mkdirSync(path.dirname(file), { recursive: true });

  execSync("npx drizzle-kit push --force", { stdio: "inherit", env: process.env });

  const { db, sqlite } = await import("./client");
  sqlite.exec(readFileSync(path.resolve(process.cwd(), "src/platform/db/triggers.sql"), "utf8"));

  const { seedUsers } = await import("./seed");
  const { apps } = await import("@/apps/registry");
  db.transaction((tx) => {
    seedUsers(tx);
    for (const app of apps) app.seed(tx);
  });

  console.log(`reset ${file}: seeded users and ${apps.length} app(s): ${apps.map((a) => a.policy.app).join(", ") || "-"}`);
}

if (process.argv[1] && /reset\.ts$/.test(process.argv[1])) {
  resetDatabase()
    .then(() => {
      if (ensureSessionSecret()) console.log("generated a random SESSION_SECRET in .env.local");
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
