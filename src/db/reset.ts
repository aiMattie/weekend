/** Wipe all data (keeps schema + migration tables) and re-seed. Used by db:reset and the e2e reset endpoint. */
import { getSqlite, ID_SEQUENCE_START } from "./client";
import { seed, type SeedResult } from "./seed";

export function wipeData(): void {
  const sqlite = getSqlite();
  const tables = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle_migrations%' AND name <> 'id_sequence' AND name NOT LIKE 'search_index\\_%' ESCAPE '\\'")
    .all() as { name: string }[];
  sqlite.pragma("foreign_keys = OFF");
  const tx = sqlite.transaction(() => {
    for (const t of tables) sqlite.exec(`DELETE FROM "${t.name}"`);
    sqlite.prepare("UPDATE id_sequence SET value = ? WHERE name = 'id'").run(ID_SEQUENCE_START);
  });
  tx();
  sqlite.pragma("foreign_keys = ON");
}

export async function resetAndSeed(opts: Parameters<typeof seed>[0] = {}): Promise<SeedResult> {
  wipeData();
  return seed(opts);
}
