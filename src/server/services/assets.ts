/**
 * Assets (file uploads). Bytes live in data/files (env FILES_DIR overrides), metadata in the core
 * `assets` table. Used by the `file` column, the item panel Files tab and update attachments.
 * REST: POST/GET /api/v1/assets, GET/DELETE /api/v1/assets/:id.
 */
import { and, desc, eq } from "drizzle-orm";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { Actor } from "../../lib/actor";
import { ForbiddenError, NotFoundError, ValidationError } from "../../lib/errors";
import { newId } from "../../lib/id";
import { can } from "../../lib/permissions";
import { idSchema } from "../../lib/zod-schemas";
import { db } from "../../db/client";
import { assets, items, updates } from "../../db/schema/core";
import { IMAGE_RE, type FileValue } from "../columns/file";
import { changeMultipleColumnValues } from "./items";
import { getItemRow, resolveColumn, parse, record, requireBoard, type ItemRow } from "./_shared";

/** 10 MB: Next buffers proxy request bodies up to experimental.proxyClientMaxBodySize (default 10 MB); raise both together. */
export const MAX_UPLOAD_BYTES = 9 * 1024 * 1024;
export const filesDir = (): string => process.env.FILES_DIR ?? path.join(process.cwd(), "data", "files");

type AssetRow = typeof assets.$inferSelect;
export interface AssetDto {
  id: string; boardId: string | null; itemId: string | null; updateId: string | null; columnId: string | null;
  name: string; mimeType: string | null; size: number; url: string; isImage: boolean; uploadedBy: string | null; createdAt: string;
}

export const toDto = (a: AssetRow): AssetDto => ({
  id: a.id, boardId: a.boardId, itemId: a.itemId, updateId: a.updateId, columnId: a.columnId, name: a.name, mimeType: a.mimeType, size: a.size,
  url: `/api/v1/assets/${a.id}`, isImage: (a.mimeType ?? "").startsWith("image/") || IMAGE_RE.test(a.name), uploadedBy: a.uploadedBy, createdAt: a.createdAt,
});

const uploadInput = z.object({
  itemId: idSchema.optional(),
  updateId: idSchema.optional(),
  boardId: idSchema.optional(),
  /** a `file` column of the item: the file is also added to that column's value */
  columnId: z.string().min(1).max(64).optional(),
  name: z.string().trim().min(1).max(255),
  mimeType: z.string().max(200).optional(),
});

const safeName = (n: string) => n.replace(/[/\\]/g, "_").replace(/[^\p{L}\p{N}._ ()-]+/gu, "_").slice(-120) || "file";

export function upload(actor: Actor, input: unknown, bytes: Uint8Array): AssetDto {
  const d = parse(uploadInput, input);
  if (bytes.byteLength === 0) throw new ValidationError("The file is empty");
  if (bytes.byteLength > MAX_UPLOAD_BYTES) throw new ValidationError(`File is too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024} MB)`);
  let itemId = d.itemId ?? null;
  let boardId = d.boardId ?? null;
  const updateId = d.updateId ?? null;
  if (updateId) {
    const u = db.select().from(updates).where(eq(updates.id, updateId)).get();
    if (!u) throw new NotFoundError("Update");
    itemId = u.itemId;
    boardId = u.boardId;
    requireBoard(actor, boardId, "board:comment");
  } else if (itemId) {
    const it = getItemRow(itemId);
    boardId = it.boardId;
    requireBoard(actor, boardId, "board:edit_items");
  } else if (boardId) requireBoard(actor, boardId, "board:edit_items");
  else throw new ValidationError("itemId, updateId or boardId is required");

  let colId: string | null = null;
  if (d.columnId) {
    if (!itemId) throw new ValidationError("columnId needs an itemId");
    const col = resolveColumn(boardId!, d.columnId);
    if (col.boardId !== boardId || col.type !== "file") throw new ValidationError("columnId must be a file column of the item's board");
    colId = col.id;
  }
  const id = newId();
  const name = safeName(d.name);
  const rel = `${id}-${name}`;
  mkdirSync(filesDir(), { recursive: true });
  writeFileSync(path.join(filesDir(), rel), bytes);
  const row = db.insert(assets).values({ id, boardId, itemId, updateId, columnId: colId, name: d.name, mimeType: d.mimeType ?? null, size: bytes.byteLength, path: rel, uploadedBy: actor.isSystem ? null : actor.id }).returning().get();
  const dto = toDto(row);
  if (colId && itemId) {
    const cur = (getItemRow(itemId).values[colId] as FileValue | undefined)?.files ?? [];
    changeMultipleColumnValues(actor, itemId, { [colId]: { files: [...cur, { assetId: id, name: d.name, size: row.size, mimeType: row.mimeType ?? undefined, isImage: dto.isImage }] } });
  }
  record(actor, { type: "item.updated", boardId: boardId!, itemId: itemId ?? "" }, itemId ? { event: "upload_file", itemId, data: { fileName: d.name, size: row.size } } : null);
  return dto;
}

const listInput = z.object({ itemId: idSchema.optional(), updateId: idSchema.optional(), boardId: idSchema.optional(), columnId: z.string().max(64).optional() });

export function list(actor: Actor, query: unknown): AssetDto[] {
  const q = parse(listInput, query);
  let boardId = q.boardId;
  if (q.itemId) boardId = getItemRow(q.itemId).boardId;
  else if (q.updateId) boardId = db.select().from(updates).where(eq(updates.id, q.updateId)).get()?.boardId ?? boardId;
  if (!boardId) throw new ValidationError("itemId, updateId or boardId is required");
  requireBoard(actor, boardId, "board:view");
  const rows = db.select().from(assets).where(and(
    eq(assets.boardId, boardId),
    q.itemId ? eq(assets.itemId, q.itemId) : undefined,
    q.updateId ? eq(assets.updateId, q.updateId) : undefined,
    q.columnId ? eq(assets.columnId, q.columnId) : undefined,
  )).orderBy(desc(assets.createdAt)).all();
  return rows.map(toDto);
}

function row(id: string): AssetRow {
  const a = db.select().from(assets).where(eq(assets.id, id)).get();
  if (!a) throw new NotFoundError("Asset");
  return a;
}

export function get(actor: Actor, id: string): AssetDto {
  const a = row(id);
  if (a.boardId) requireBoard(actor, a.boardId, "board:view");
  return toDto(a);
}

/** Row + absolute path of the stored file (for the download route). */
export function read(actor: Actor, id: string): { asset: AssetDto; absPath: string; bytes: () => Buffer } {
  const a = row(id);
  if (a.boardId) requireBoard(actor, a.boardId, "board:view");
  const abs = path.join(/* turbopackIgnore: true */ filesDir(), path.basename(a.path));
  if (!existsSync(/* turbopackIgnore: true */ abs)) throw new NotFoundError("File");
  return { asset: toDto(a), absPath: abs, bytes: () => readFileSync(/* turbopackIgnore: true */ abs) };
}

export function remove(actor: Actor, id: string): void {
  const a = row(id);
  if (a.boardId && !(a.uploadedBy === actor.id && can(actor, "board:view", { boardId: a.boardId })) && !can(actor, "board:edit_items", { boardId: a.boardId })) throw new ForbiddenError();
  let item: ItemRow | undefined;
  if (a.itemId) item = db.select().from(items).where(eq(items.id, a.itemId)).get();
  db.delete(assets).where(eq(assets.id, id)).run();
  rmSync(path.join(/* turbopackIgnore: true */ filesDir(), path.basename(a.path)), { force: true });
  if (item && a.columnId) {
    const files = ((item.values[a.columnId] as FileValue | undefined)?.files ?? []).filter((f) => f.assetId !== id);
    changeMultipleColumnValues(actor, item.id, { [a.columnId]: files.length ? { files } : null });
  }
  if (a.boardId) record(actor, { type: "item.updated", boardId: a.boardId, itemId: a.itemId ?? "" }, a.itemId ? { event: "delete_file", itemId: a.itemId, data: { fileName: a.name } } : null);
}
