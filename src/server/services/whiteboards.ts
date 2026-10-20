/**
 * Whiteboard service (light infinite canvas). `data.elements` is the persisted JSON; every save
 * bumps `version` so other clients can poll `getVersion` and reload. `update` accepts either a full
 * `data` replacement or a `patch` ({ upsert, remove }) which merges atomically (no lost edits when
 * two people draw at once).
 */
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "../../lib/actor";
import { ConflictError, ForbiddenError, NotFoundError } from "../../lib/errors";
import { can } from "../../lib/permissions";
import { idSchema } from "../../lib/zod-schemas";
import { db } from "../../db/client";
import { whiteboards, type WhiteboardData, type WhiteboardElement } from "../../db/schema/docs";
import { parse } from "./_shared";

export type WhiteboardRow = typeof whiteboards.$inferSelect;

export const ELEMENT_TYPES = ["note", "rect", "ellipse", "diamond", "text", "connector", "pen", "image"] as const;

const elementSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(ELEMENT_TYPES),
  x: z.number().finite(),
  y: z.number().finite(),
  w: z.number().finite().optional(),
  h: z.number().finite().optional(),
  text: z.string().max(5000).optional(),
  color: z.string().max(32).optional(),
  from: z.string().max(64).optional(),
  to: z.string().max(64).optional(),
  points: z.array(z.array(z.number().finite())).max(5000).optional(),
  src: z.string().max(3_000_000).optional(),
  z: z.number().finite().optional(),
});
const viewSchema = z.object({ x: z.number().finite(), y: z.number().finite(), zoom: z.number().finite().min(0.05).max(10) });
const dataSchema = z.object({ elements: z.array(elementSchema).max(5000), view: viewSchema.optional() });

const updateInput = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  data: dataSchema.optional(),
  patch: z.object({ upsert: z.array(elementSchema).max(2000).optional(), remove: z.array(z.string().max(64)).max(2000).optional(), view: viewSchema.optional() }).optional(),
  /** with `data`: refuse (409) when someone else saved in between */
  baseVersion: z.number().int().optional(),
});

function getRow(id: string): WhiteboardRow {
  const w = db.select().from(whiteboards).where(eq(whiteboards.id, id)).get();
  if (!w || w.state === "deleted") throw new NotFoundError("Whiteboard");
  return w;
}

function requireView(actor: Actor, id: string): WhiteboardRow {
  const w = getRow(id);
  if (!can(actor, "workspace:view", { workspaceId: w.workspaceId })) throw new NotFoundError("Whiteboard");
  return w;
}

function requireEdit(actor: Actor, id: string): WhiteboardRow {
  const w = requireView(actor, id);
  if (!can(actor, "workspace:create_board", { workspaceId: w.workspaceId })) throw new ForbiddenError("You can only view this whiteboard");
  return w;
}

export function list(actor: Actor, query: unknown = {}): (Omit<WhiteboardRow, "data"> & { elementCount: number })[] {
  const q = parse(z.object({ workspaceId: idSchema.optional() }), query);
  const rows = db.select().from(whiteboards).where(and(eq(whiteboards.state, "active"), q.workspaceId ? eq(whiteboards.workspaceId, q.workspaceId) : undefined)).orderBy(desc(whiteboards.updatedAt), desc(whiteboards.id)).all();
  return rows.filter((w) => can(actor, "workspace:view", { workspaceId: w.workspaceId })).map(({ data, ...rest }) => ({ ...rest, elementCount: data.elements.length }));
}

export function get(actor: Actor, id: string): WhiteboardRow & { canEdit: boolean } {
  const w = requireView(actor, id);
  return { ...w, canEdit: can(actor, "workspace:create_board", { workspaceId: w.workspaceId }) };
}

export function getVersion(actor: Actor, id: string): { id: string; version: number; updatedAt: string } {
  const w = requireView(actor, id);
  return { id: w.id, version: w.version, updatedAt: w.updatedAt };
}

export function create(actor: Actor, input: unknown): WhiteboardRow {
  const d = parse(z.object({ workspaceId: idSchema, name: z.string().trim().min(1).max(255).optional(), data: dataSchema.optional() }), input);
  if (!can(actor, "workspace:create_board", { workspaceId: d.workspaceId })) throw new ForbiddenError();
  return db.insert(whiteboards).values({ workspaceId: d.workspaceId, name: d.name ?? "Nieuw whiteboard", data: (d.data ?? { elements: [] }) as WhiteboardData, ownerId: actor.isSystem ? null : actor.id }).returning().get();
}

/** Apply `patch` to a data blob (pure, exported for tests). Connectors pointing at removed elements are dropped. */
export function applyPatch(data: WhiteboardData, patch: { upsert?: WhiteboardElement[]; remove?: string[]; view?: WhiteboardData["view"] }): WhiteboardData {
  const map = new Map(data.elements.map((e) => [e.id, e]));
  for (const id of patch.remove ?? []) map.delete(id);
  for (const e of patch.upsert ?? []) map.set(e.id, e);
  const removed = new Set(patch.remove ?? []);
  const elements = [...map.values()].filter((e) => !(e.type === "connector" && ((e.from && removed.has(e.from)) || (e.to && removed.has(e.to)))));
  return { elements, view: patch.view ?? data.view };
}

export function update(actor: Actor, id: string, input: unknown): WhiteboardRow {
  const p = parse(updateInput, input);
  const cur = requireEdit(actor, id);
  if (p.data && p.baseVersion !== undefined && p.baseVersion !== cur.version) throw new ConflictError("Whiteboard was changed by someone else");
  let data: WhiteboardData | undefined;
  if (p.data) data = p.data as WhiteboardData;
  else if (p.patch) data = applyPatch(cur.data, p.patch as Parameters<typeof applyPatch>[1]);
  if (!data && p.name === undefined) return cur;
  return db.update(whiteboards).set({ ...(p.name !== undefined ? { name: p.name } : {}), ...(data ? { data, version: cur.version + 1 } : {}) }).where(eq(whiteboards.id, id)).returning().get();
}

export function remove(actor: Actor, id: string): void {
  requireEdit(actor, id);
  db.update(whiteboards).set({ state: "deleted" }).where(eq(whiteboards.id, id)).run();
}
