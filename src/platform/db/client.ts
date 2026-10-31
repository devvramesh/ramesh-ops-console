import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { loadEnv } from "../env";
import * as approvalsSchema from "../approvals/schema";
import * as platformSchema from "./schema";

loadEnv();

const schema = { ...platformSchema, ...approvalsSchema };

export function databaseFile() {
  return path.resolve(process.cwd(), process.env.DATABASE_FILE ?? "data/app.sqlite");
}

function open() {
  const file = databaseFile();
  mkdirSync(path.dirname(file), { recursive: true });
  const handle = new Database(file);
  handle.pragma("journal_mode = WAL");
  handle.pragma("foreign_keys = ON");
  return handle;
}

// One connection per process; next dev re-evaluates modules on HMR.
const globalRef = globalThis as { __opsSqlite?: Database.Database };
export const sqlite = globalRef.__opsSqlite ?? (globalRef.__opsSqlite = open());

export const db = drizzle(sqlite, { schema });

export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
