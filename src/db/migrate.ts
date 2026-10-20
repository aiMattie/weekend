/**
 * Applies migrations for every module folder in src/db/migrations/<module>/ (each has its own
 * drizzle journal and its own tracking table `__drizzle_migrations_<module>`).
 * Order: core first, then alphabetical. Idempotent. Called automatically by createDb().
 */
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

export function migrationsRoot(): string {
  return path.join(process.cwd(), "src/db/migrations");
}

export function listMigrationModules(): string[] {
  const root = migrationsRoot();
  if (!existsSync(root)) return [];
  const mods = readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(path.join(root, d.name, "meta", "_journal.json")))
    .map((d) => d.name)
    .sort();
  return ["core", ...mods.filter((m) => m !== "core")].filter((m) => mods.includes(m));
}

export function runMigrations(db: BetterSQLite3Database<any>): string[] { // eslint-disable-line @typescript-eslint/no-explicit-any
  const applied: string[] = [];
  for (const mod of listMigrationModules()) {
    migrate(db, {
      migrationsFolder: path.join(migrationsRoot(), mod),
      migrationsTable: `__drizzle_migrations_${mod.replace(/[^a-z0-9]/gi, "_")}`,
    });
    applied.push(mod);
  }
  return applied;
}
