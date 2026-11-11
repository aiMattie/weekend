import { and, asc, eq, inArray } from "drizzle-orm";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { Actor } from "../../lib/actor";
import { ForbiddenError, NotFoundError, ValidationError } from "../../lib/errors";
import { newId } from "../../lib/id";
import { assertCan, can, workspaceVisibilityFilter } from "../../lib/permissions";
import { idSchema, nameSchema } from "../../lib/zod-schemas";
import { db } from "../../db/client";
import { boards, users, workspaceFavorites, workspaceMembers, workspaces } from "../../db/schema/core";
import { emit } from "../../lib/events";
import { computePosition, parse } from "./_shared";

export type Workspace = typeof workspaces.$inferSelect;

const createSchema = z.object({
  name: nameSchema,
  description: z.string().max(2000).nullish(),
  kind: z.enum(["open", "closed"]).default("open"),
  color: z.string().max(20).nullish(),
  icon: z.string().max(60).nullish(),
  /** Groups workspaces in the switcher. Blank -> null (no category). */
  category: z.string().trim().max(60).nullish().transform((v) => (v ? v : null)),
});
const updateSchema = createSchema.partial();

const wsEvent = (actor: Actor) => emit({ type: "workspace.changed", boardId: null, actorId: actor.isSystem ? null : actor.id });

/** Workspaces the actor may see, ordered by position. */
export function list(actor: Actor): Workspace[] {
  const rows = db.select().from(workspaces)
    .where(and(eq(workspaces.accountId, actor.accountId), eq(workspaces.state, "active")))
    .orderBy(asc(workspaces.position), asc(workspaces.name)).all();
  return rows.filter(workspaceVisibilityFilter(actor));
}

export function get(actor: Actor, id: string): Workspace {
  const ws = db.select().from(workspaces).where(eq(workspaces.id, id)).get();
  if (!ws || ws.state === "deleted" || ws.accountId !== actor.accountId) throw new NotFoundError("Workspace");
  assertCan(actor, "workspace:view", { workspaceId: id });
  return ws;
}

export function create(actor: Actor, input: unknown): Workspace {
  const data = parse(createSchema, input);
  assertCan(actor, "workspace:create");
  const siblings = db.select({ id: workspaces.id, position: workspaces.position }).from(workspaces)
    .where(eq(workspaces.accountId, actor.accountId)).orderBy(asc(workspaces.position)).all();
  const ws = db.insert(workspaces).values({
    ...data, accountId: actor.accountId, position: computePosition(siblings), createdBy: actor.isSystem ? null : actor.id,
  }).returning().get();
  if (!actor.isSystem) db.insert(workspaceMembers).values({ workspaceId: ws.id, userId: actor.id, role: "owner" }).run();
  wsEvent(actor);
  return ws;
}

export function update(actor: Actor, id: string, input: unknown): Workspace {
  const data = parse(updateSchema, input);
  get(actor, id);
  assertCan(actor, "workspace:update", { workspaceId: id });
  const ws = db.update(workspaces).set(data).where(eq(workspaces.id, id)).returning().get();
  wsEvent(actor);
  return ws;
}

/** Soft delete (state = deleted); boards inside stay in the DB but become unreachable. */
/* ------------------------------------------------------------ logo */

/** Logos are shown inline everywhere, so only raster images (no SVG: it can carry script). */
export const LOGO_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
export const MAX_LOGO_BYTES = 1024 * 1024;
const logosDir = () => path.join(process.env.FILES_DIR ?? path.join(process.cwd(), "data", "files"), "workspace-logos");
const logoPath = (file: string) => path.join(logosDir(), path.basename(file));

/** Magic-number check, so a renamed non-image is refused even when the browser sends an image type. */
function sniffImage(b: Uint8Array): string | null {
  const at = (i: number, ...xs: number[]) => xs.every((x, j) => b[i + j] === x);
  if (at(0, 0x89, 0x50, 0x4e, 0x47)) return "image/png";
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return "image/gif";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  return null;
}

/** URL of the workspace logo for <img src>; changes with every upload (cache busting). */
export const logoUrl = (ws: { id: string; logo: string | null }): string | null =>
  ws.logo ? `/api/v1/workspaces/${ws.id}/logo?v=${encodeURIComponent(ws.logo)}` : null;

export function setLogo(actor: Actor, id: string, bytes: Uint8Array): Workspace {
  const cur = get(actor, id);
  assertCan(actor, "workspace:update", { workspaceId: id });
  if (bytes.byteLength === 0) throw new ValidationError("The file is empty");
  if (bytes.byteLength > MAX_LOGO_BYTES) throw new ValidationError("Logo is too large (max 1 MB)");
  const mime = sniffImage(bytes);
  if (!mime) throw new ValidationError("Logo must be a PNG, JPG, WebP or GIF image");
  const file = `${id}-${newId()}.${LOGO_TYPES[mime]}`;
  mkdirSync(logosDir(), { recursive: true });
  writeFileSync(logoPath(file), bytes);
  const ws = db.update(workspaces).set({ logo: file }).where(eq(workspaces.id, id)).returning().get();
  if (cur.logo) rmSync(logoPath(cur.logo), { force: true });
  wsEvent(actor);
  return ws;
}

export function removeLogo(actor: Actor, id: string): Workspace {
  const cur = get(actor, id);
  assertCan(actor, "workspace:update", { workspaceId: id });
  const ws = db.update(workspaces).set({ logo: null }).where(eq(workspaces.id, id)).returning().get();
  if (cur.logo) rmSync(logoPath(cur.logo), { force: true });
  wsEvent(actor);
  return ws;
}

/** The logo file of a workspace the actor may see. */
export function readLogo(actor: Actor, id: string): { absPath: string; mimeType: string } {
  const ws = get(actor, id);
  if (!ws.logo || !existsSync(logoPath(ws.logo))) throw new NotFoundError("Logo");
  const ext = path.extname(ws.logo).slice(1);
  const mimeType = Object.entries(LOGO_TYPES).find(([, e]) => e === ext)?.[0] ?? "application/octet-stream";
  return { absPath: logoPath(ws.logo), mimeType };
}

export function remove(actor: Actor, id: string): void {
  get(actor, id);
  assertCan(actor, "workspace:delete", { workspaceId: id });
  db.update(workspaces).set({ state: "deleted" }).where(eq(workspaces.id, id)).run();
  db.update(boards).set({ state: "deleted" }).where(eq(boards.workspaceId, id)).run();
  wsEvent(actor);
}

export function archive(actor: Actor, id: string): Workspace {
  get(actor, id);
  assertCan(actor, "workspace:update", { workspaceId: id });
  const ws = db.update(workspaces).set({ state: "archived" }).where(eq(workspaces.id, id)).returning().get();
  wsEvent(actor);
  return ws;
}

export function move(actor: Actor, id: string, spec: { beforeId?: string; afterId?: string; top?: boolean; position?: number }): Workspace {
  get(actor, id);
  assertCan(actor, "workspace:update", { workspaceId: id });
  const siblings = db.select({ id: workspaces.id, position: workspaces.position }).from(workspaces)
    .where(eq(workspaces.accountId, actor.accountId)).orderBy(asc(workspaces.position)).all().filter((s) => s.id !== id);
  const ws = db.update(workspaces).set({ position: computePosition(siblings, spec) }).where(eq(workspaces.id, id)).returning().get();
  wsEvent(actor);
  return ws;
}

/** Ids of the workspaces the actor starred (per user; shown first in the switcher). */
export function listFavoriteIds(actor: Actor): string[] {
  return db.select({ id: workspaceFavorites.workspaceId }).from(workspaceFavorites)
    .where(eq(workspaceFavorites.userId, actor.id)).all().map((r) => r.id);
}

/** Stars or unstars a workspace for the actor. Returns the new favorite state. */
export function toggleFavorite(actor: Actor, id: string): boolean {
  get(actor, parse(idSchema, id));
  const key = and(eq(workspaceFavorites.userId, actor.id), eq(workspaceFavorites.workspaceId, id));
  if (db.select().from(workspaceFavorites).where(key).get()) {
    db.delete(workspaceFavorites).where(key).run();
    return false;
  }
  db.insert(workspaceFavorites).values({ userId: actor.id, workspaceId: id }).run();
  return true;
}

export type WorkspaceMember = { userId: string; role: "owner" | "member" | "viewer"; name: string; email: string };

export function listMembers(actor: Actor, id: string): WorkspaceMember[] {
  get(actor, id);
  return db.select({ userId: workspaceMembers.userId, role: workspaceMembers.role, name: users.name, email: users.email })
    .from(workspaceMembers).innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(eq(workspaceMembers.workspaceId, id)).all();
}

export function setMember(actor: Actor, id: string, userId: string, role: "owner" | "member" | "viewer" = "member"): void {
  const uid = parse(idSchema, userId);
  get(actor, id);
  assertCan(actor, "workspace:manage_members", { workspaceId: id });
  const u = db.select().from(users).where(and(eq(users.id, uid), eq(users.accountId, actor.accountId))).get();
  if (!u) throw new NotFoundError("User");
  db.insert(workspaceMembers).values({ workspaceId: id, userId: uid, role })
    .onConflictDoUpdate({ target: [workspaceMembers.workspaceId, workspaceMembers.userId], set: { role } }).run();
  wsEvent(actor);
}

export function removeMember(actor: Actor, id: string, userId: string): void {
  get(actor, id);
  if (userId !== actor.id) assertCan(actor, "workspace:manage_members", { workspaceId: id });
  else if (!can(actor, "workspace:view", { workspaceId: id })) throw new ForbiddenError();
  db.delete(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, id), eq(workspaceMembers.userId, userId))).run();
  wsEvent(actor);
}

export function memberCounts(ids: string[]): Record<string, number> {
  if (!ids.length) return {};
  const rows = db.select({ workspaceId: workspaceMembers.workspaceId }).from(workspaceMembers).where(inArray(workspaceMembers.workspaceId, ids)).all();
  const out: Record<string, number> = {};
  for (const r of rows) out[r.workspaceId] = (out[r.workspaceId] ?? 0) + 1;
  return out;
}
