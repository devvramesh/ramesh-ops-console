import { execSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { loadEnv } from "../env";

// Used by `npm run db:reset` and by tests/setup.ts.
export async function resetDatabase() {
  loadEnv();
  const file = path.resolve(process.cwd(), process.env.DATABASE_FILE ?? "data/app.sqlite");
  process.env.DATABASE_FILE = file;

  for (const suffix of ["", "-wal", "-shm"]) rmSync(file + suffix, { force: true });

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
  resetDatabase().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
