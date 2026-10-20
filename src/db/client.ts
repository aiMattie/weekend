/**
 * SQLite connection (better-sqlite3 + Drizzle). Server only.
 *
 *  - DATABASE_URL: `file:data/app.db` (default), `file:/abs/path.db` or `:memory:` / `file::memory:`.
 *  - On first use the module-folders under src/db/migrations are applied automatically
 *    (core first, then the other modules alphabetically), see ./migrate.ts.
 *  - The connection is cached on globalThis so Next dev HMR and multiple route bundles share it.
 */
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { setIdGenerator } from "../lib/id";
import { runMigrations } from "./migrate";
import * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema>;
export type Sqlite = Database.Database;

export const ID_SEQUENCE_START = 2_000_000_000;

type Holder = { db?: Db; sqlite?: Sqlite; url?: string };
const g = globalThis as unknown as { __weekendDb?: Holder };

export function resolveDatabasePath(url = process.env.DATABASE_URL || "file:data/app.db"): string {
  if (url === ":memory:" || url === "file::memory:" || url === "file:memory") return ":memory:";
  const p = url.startsWith("file:") ? url.slice("file:".length) : url;
  return path.isAbsolute(p) ? p : path.join(/* turbopackIgnore: true */ process.cwd(), p);
}

/** Open a fresh connection, apply pragmas + migrations. Used by getDb() and by tests. */
export function createDb(url?: string, opts: { migrate?: boolean } = {}): { db: Db; sqlite: Sqlite } {
  const file = resolveDatabasePath(url);
  if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.exec(
    `CREATE TABLE IF NOT EXISTS id_sequence (name TEXT PRIMARY KEY, value INTEGER NOT NULL);
     INSERT OR IGNORE INTO id_sequence (name, value) VALUES ('id', ${ID_SEQUENCE_START});`,
  );
  const db = drizzle(sqlite, { schema });
  if (opts.migrate !== false) runMigrations(db);
  return { db, sqlite };
}

function nextIdFrom(sqlite: Sqlite): () => string {
  const stmt = sqlite.prepare("UPDATE id_sequence SET value = value + 1 WHERE name = 'id' RETURNING value");
  return () => String((stmt.get() as { value: number }).value);
}

/** Replace the active connection (tests). Pass `null` to close and clear. */
export function setDb(conn: { db: Db; sqlite: Sqlite } | null): void {
  const prev = g.__weekendDb;
  if (prev?.sqlite && prev.sqlite !== conn?.sqlite) {
    try {
      prev.sqlite.close();
    } catch {
      /* already closed */
    }
  }
  if (!conn) {
    g.__weekendDb = undefined;
    setIdGenerator(null);
    return;
  }
  g.__weekendDb = { db: conn.db, sqlite: conn.sqlite, url: process.env.DATABASE_URL };
  setIdGenerator(nextIdFrom(conn.sqlite));
}

export function getDb(): Db {
  const cur = g.__weekendDb;
  if (cur?.db) return cur.db;
  setDb(createDb());
  return g.__weekendDb!.db!;
}

export function getSqlite(): Sqlite {
  getDb();
  return g.__weekendDb!.sqlite!;
}

/** Lazy proxy so services can `import { db } from "@/db/client"` and always hit the live connection. */
export const db: Db = new Proxy({} as Db, {
  get(_t, prop) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const v = real[prop];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(real) : v;
  },
});

export { schema };
