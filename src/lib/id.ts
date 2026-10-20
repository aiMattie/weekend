/**
 * Id generation. Ids are numeric strings (10 digits, growing).
 *
 * They come from a persistent sequence (table `id_sequence`, see src/db/client.ts) so they are
 * unique, ordered by creation and safe across processes (SQLite serialises writes). The DB layer
 * registers the generator at startup; before that (e.g. in pure unit tests) a monotonic
 * in-memory fallback is used.
 */
type IdGenerator = () => string;

// Held on globalThis so every Next bundle/module instance uses the same DB-backed generator.
const g = globalThis as unknown as { __weekendIdGen?: IdGenerator | null; __weekendIdFallback?: number };

export function setIdGenerator(fn: IdGenerator | null): void {
  g.__weekendIdGen = fn;
}

export function newId(): string {
  if (g.__weekendIdGen) return g.__weekendIdGen();
  g.__weekendIdFallback = (g.__weekendIdFallback ?? 2_000_000_000) + 1;
  return String(g.__weekendIdFallback);
}

/** True for ids produced by newId() (numeric strings). */
export const isNumericId = (v: unknown): v is string =>
  typeof v === "string" && /^\d{1,18}$/.test(v);
