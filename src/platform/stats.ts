import { sql } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { db } from "./db/client";

/** Row count for an app's main table, for home-page tiles. Reads only; authorization is the caller's. */
export function countRows(table: SQLiteTable): number {
  return db.select({ n: sql<number>`count(*)` }).from(table).get()!.n;
}
