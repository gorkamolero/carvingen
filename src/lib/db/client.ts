import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import { getServerEnv } from "@/lib/env";
import * as schema from "@/lib/db/schema";

const globalForDb = globalThis as typeof globalThis & {
  __carvingenDb?: ReturnType<typeof createDatabase>;
};

function createDatabase() {
  const env = getServerEnv();
  mkdirSync(dirname(env.DATABASE_PATH), { recursive: true });
  const sqlite = new Database(env.DATABASE_PATH);
  sqlite.pragma("journal_mode = WAL");
  return drizzle(sqlite, { schema });
}

export const db = globalForDb.__carvingenDb ?? createDatabase();

if (process.env.NODE_ENV !== "production") {
  globalForDb.__carvingenDb = db;
}
