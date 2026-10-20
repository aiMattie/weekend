import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "../../lib/actor";
import { NotFoundError, ValidationError } from "../../lib/errors";
import { emit } from "../../lib/events";
import { assertCan } from "../../lib/permissions";
import { hexColor, idSchema, nameSchema } from "../../lib/zod-schemas";
import { db } from "../../db/client";
import { boards, folders } from "../../db/schema/core";
import { computePosition, parse } from "./_shared";
import * as workspaces from "./workspaces";

export type Folder = typeof folders.$inferSelect;

const createSchema = z.object({ workspaceId: idSchema, name: nameSchema, parentFolderId: idSchema.nullish(), color: hexColor.nullish() });
const updateSchema = z.object({ name: nameSchema.optional(), color: hexColor.nullish(), parentFolderId: idSchema.nullish() });

const changed = (actor: Actor) => emit({ type: "folder.changed", boardId: null, actorId: actor.isSystem ? null : actor.id });

export function list(actor: Actor, workspaceId: string): Folder[] {
  workspaces.get(actor, workspaceId);
  return db.select().from(folders).where(eq(folders.workspaceId, workspaceId)).orderBy(asc(folders.position)).all();
}

export function get(actor: Actor, id: string): Folder {
  const f = db.select().from(folders).where(eq(folders.id, id)).get();
  if (!f) throw new NotFoundError("Folder");
  workspaces.get(actor, f.workspaceId);
  return f;
}

export function create(actor: Actor, input: unknown): Folder {
  const d = parse(createSchema, input);
  workspaces.get(actor, d.workspaceId);
  assertCan(actor, "workspace:create_board", { workspaceId: d.workspaceId });
  if (d.parentFolderId && get(actor, d.parentFolderId).workspaceId !== d.workspaceId) throw new ValidationError("Parent folder is in another workspace");
  const siblings = db.select({ id: folders.id, position: folders.position }).from(folders).where(eq(folders.workspaceId, d.workspaceId)).orderBy(asc(folders.position)).all();
  const f = db.insert(folders).values({ ...d, position: computePosition(siblings) }).returning().get();
  changed(actor);
  return f;
}

export function update(actor: Actor, id: string, input: unknown): Folder {
  const d = parse(updateSchema, input);
  const f = get(actor, id);
  assertCan(actor, "workspace:create_board", { workspaceId: f.workspaceId });
  if (d.parentFolderId === id) throw new ValidationError("A folder cannot be its own parent");
  const row = db.update(folders).set(d).where(eq(folders.id, id)).returning().get();
  changed(actor);
  return row;
}

/** Deletes the folder and its sub-folders; boards inside move to the workspace root. */
export function remove(actor: Actor, id: string): void {
  const f = get(actor, id);
  assertCan(actor, "workspace:create_board", { workspaceId: f.workspaceId });
  const all = db.select().from(folders).where(eq(folders.workspaceId, f.workspaceId)).all();
  const ids = new Set([id]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const x of all) if (x.parentFolderId && ids.has(x.parentFolderId) && !ids.has(x.id)) { ids.add(x.id); grew = true; }
  }
  db.update(boards).set({ folderId: null }).where(inArray(boards.folderId, [...ids])).run();
  db.delete(folders).where(and(eq(folders.workspaceId, f.workspaceId), inArray(folders.id, [...ids]))).run();
  changed(actor);
}
