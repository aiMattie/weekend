/** external_refs helpers: maps (source, entity type, external id) to a clone entity id. */
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../../../db/client";
import { externalRefs } from "../../../db/schema/import-jobs";

export type RefSource = "monday" | "jira";

export const hashOf = (v: unknown): string => createHash("sha1").update(JSON.stringify(v)).digest("hex").slice(0, 16);

export function getRef(source: RefSource, entityType: string, externalId: string): { entityId: string; hash: string | null } | undefined {
  const r = db.select().from(externalRefs).where(and(eq(externalRefs.source, source), eq(externalRefs.entityType, entityType), eq(externalRefs.externalId, externalId))).get();
  return r ? { entityId: r.entityId, hash: r.hash } : undefined;
}

export function saveRef(source: RefSource, entityType: string, externalId: string, entityId: string, hash: string | null): void {
  db.insert(externalRefs).values({ source, entityType, externalId, entityId, hash })
    .onConflictDoUpdate({ target: [externalRefs.source, externalRefs.entityType, externalRefs.externalId], set: { entityId, hash, updatedAt: new Date().toISOString() } }).run();
}

/** Reverse lookup: external id of a clone entity (e.g. the monday.com id of an item). */
export function externalIdOf(source: RefSource, entityType: string, entityId: string): string | undefined {
  return db.select().from(externalRefs).where(and(eq(externalRefs.source, source), eq(externalRefs.entityType, entityType), eq(externalRefs.entityId, entityId))).get()?.externalId;
}

export function listRefs(source: RefSource, entityType: string): { externalId: string; entityId: string }[] {
  return db.select({ externalId: externalRefs.externalId, entityId: externalRefs.entityId }).from(externalRefs).where(and(eq(externalRefs.source, source), eq(externalRefs.entityType, entityType))).all();
}

export type Outcome = "create" | "update" | "skip";
export interface EntityCounts { create: number; update: number; skip: number }

/**
 * Upsert tracker shared by importer and Jira migration. In dry-run mode nothing is written:
 * `upsert` only classifies the entity and hands back a numeric placeholder id (9xxxxxxxx),
 * so the surrounding code runs unchanged.
 */
export class Tracker {
  counts: Record<string, EntityCounts> = {};
  warnings: string[] = [];
  diff: string[] = [];
  private mem = new Map<string, string>();
  private dryIds = new Set<string>();
  private dryCounter = 900_000_000;
  constructor(readonly source: RefSource, readonly apply: boolean) {}

  private bump(type: string, o: Outcome): void {
    (this.counts[type] ??= { create: 0, update: 0, skip: 0 })[o]++;
  }

  /** noisy, low-value notices are counted and reported once as "N x message" */
  tally: Record<string, number> = {};
  note(msg: string): void { this.tally[msg] = (this.tally[msg] ?? 0) + 1; }

  warn(msg: string): void {
    if (this.warnings.length < 2000) this.warnings.push(msg);
  }

  line(msg: string): void {
    if (this.diff.length < 5000) this.diff.push(msg);
  }

  /** placeholder ids (numeric, so column validators accept them) are only handed out in dry-run mode */
  isPlaceholder(id: string): boolean { return this.dryIds.has(id); }

  lookup(type: string, ext: string): string | undefined {
    return this.mem.get(`${type}:${ext}`) ?? getRef(this.source, type, ext)?.entityId;
  }

  /**
   * @param adopt  find an existing clone entity that should be linked instead of creating one
   * @param create returns the new entity id
   * @param update patches the entity (called when the payload hash changed)
   */
  upsert(type: string, ext: string, hash: string, label: string, fns: { adopt?: () => string | undefined; create: () => string; update: (id: string) => void; exists?: (id: string) => boolean }): string {
    const key = `${type}:${ext}`;
    let ref = getRef(this.source, type, ext);
    if (ref && fns.exists && !fns.exists(ref.entityId)) ref = undefined;
    if (ref) {
      this.mem.set(key, ref.entityId);
      if (ref.hash === hash) { this.bump(type, "skip"); return ref.entityId; }
      this.bump(type, "update");
      this.line(`~ ${type} ${label}`);
      if (this.apply) { fns.update(ref.entityId); saveRef(this.source, type, ext, ref.entityId, hash); }
      return ref.entityId;
    }
    const adopted = fns.adopt?.();
    if (adopted) {
      this.mem.set(key, adopted);
      this.bump(type, "update");
      this.line(`= ${type} ${label} (linked to existing)`);
      if (this.apply) { fns.update(adopted); saveRef(this.source, type, ext, adopted, hash); }
      return adopted;
    }
    this.bump(type, "create");
    this.line(`+ ${type} ${label}`);
    if (!this.apply) { const ph = String(++this.dryCounter); this.dryIds.add(ph); this.mem.set(key, ph); return ph; }
    const id = fns.create();
    saveRef(this.source, type, ext, id, hash);
    this.mem.set(key, id);
    return id;
  }
}
