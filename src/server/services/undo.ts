/**
 * Undo / redo log (Ctrl+Z / Ctrl+Shift+Z). The client records each user action together with the
 * operations that revert (`undo`) and re-apply (`redo`) it. Undo/redo then replays those
 * operations through the normal services, so permissions, activity log and SSE keep working.
 * The log is a per user per board stack, capped at MAX_ENTRIES; a new action clears the redo side.
 */
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "../../lib/actor";
import { idSchema } from "../../lib/zod-schemas";
import { db } from "../../db/client";
import { undoEntries } from "../../db/schema/table-ux";
import { parse, requireBoard } from "./_shared";
import * as groups from "./groups";
import * as items from "./items";
import * as columns from "./columns";
import * as itemOps from "./item-ops";

export const MAX_ENTRIES = 100;

const stateSchema = z.enum(["active", "archived", "deleted"]);
export const undoOpSchema = z.discriminatedUnion("op", [
  /** set stored values (keyed by column id); null clears */
  z.object({ op: z.literal("setValues"), itemId: idSchema, values: z.record(z.string(), z.unknown()) }),
  z.object({ op: z.literal("rename"), itemId: idSchema, name: z.string().min(1).max(1000) }),
  z.object({ op: z.literal("moveItem"), itemId: idSchema, groupId: idSchema.optional(), position: z.number().finite() }),
  z.object({ op: z.literal("setItemState"), itemIds: z.array(idSchema).min(1).max(5000), state: stateSchema }),
  z.object({ op: z.literal("moveGroup"), groupId: idSchema, position: z.number().finite() }),
  z.object({ op: z.literal("updateGroup"), groupId: idSchema, patch: z.object({ title: z.string().min(1).max(255).optional(), color: z.string().optional() }) }),
  z.object({ op: z.literal("setGroupState"), groupId: idSchema, state: stateSchema }),
  z.object({ op: z.literal("moveColumn"), columnId: idSchema, position: z.number().finite() }),
  z.object({ op: z.literal("convertItem"), itemId: idSchema, to: z.enum(["item", "subitem"]), parentItemId: idSchema.optional(), groupId: idSchema.optional() }),
]);
export type UndoOp = z.infer<typeof undoOpSchema>;

const recordInput = z.object({
  label: z.string().trim().min(1).max(200),
  undo: z.array(undoOpSchema).min(1).max(5000),
  redo: z.array(undoOpSchema).min(1).max(5000),
});

export type UndoEntry = typeof undoEntries.$inferSelect;
export interface UndoState { canUndo: boolean; canRedo: boolean; undoLabel: string | null; redoLabel: string | null }

const mine = (actor: Actor, boardId: string) => and(eq(undoEntries.boardId, boardId), eq(undoEntries.userId, actor.id));

/** Add an action to the stack (clears the redo side, trims old entries). */
export function record(actor: Actor, boardId: string, input: unknown): UndoEntry {
  const d = parse(recordInput, input);
  requireBoard(actor, boardId, "board:view");
  db.delete(undoEntries).where(and(mine(actor, boardId), eq(undoEntries.undone, true))).run();
  const row = db.insert(undoEntries).values({ boardId, userId: actor.id, label: d.label, undoOps: d.undo, redoOps: d.redo }).returning().get();
  const all = db.select({ id: undoEntries.id }).from(undoEntries).where(mine(actor, boardId)).orderBy(desc(undoEntries.createdAt), desc(undoEntries.id)).all();
  if (all.length > MAX_ENTRIES) db.delete(undoEntries).where(inArray(undoEntries.id, all.slice(MAX_ENTRIES).map((r) => r.id))).run();
  return row;
}

export function state(actor: Actor, boardId: string): UndoState {
  requireBoard(actor, boardId, "board:view");
  const rows = db.select().from(undoEntries).where(mine(actor, boardId)).orderBy(asc(undoEntries.createdAt), asc(undoEntries.id)).all();
  const done = rows.filter((r) => !r.undone);
  const undone = rows.filter((r) => r.undone);
  return { canUndo: done.length > 0, canRedo: undone.length > 0, undoLabel: done.at(-1)?.label ?? null, redoLabel: undone[0]?.label ?? null };
}

/** Apply one operation through the services (permission checks included). */
export function applyOp(actor: Actor, op: UndoOp): void {
  switch (op.op) {
    case "setValues": items.changeMultipleColumnValues(actor, op.itemId, op.values); break;
    case "rename": items.update(actor, op.itemId, { name: op.name }); break;
    case "moveItem": items.move(actor, op.itemId, { groupId: op.groupId, position: op.position }); break;
    case "setItemState":
      for (const id of op.itemIds) {
        if (op.state === "active") items.restore(actor, id);
        else if (op.state === "archived") items.archive(actor, id);
        else items.remove(actor, id);
      }
      break;
    case "moveGroup": groups.move(actor, op.groupId, { position: op.position }); break;
    case "updateGroup": groups.update(actor, op.groupId, op.patch); break;
    case "setGroupState": groups.setState(actor, op.groupId, op.state); break;
    case "moveColumn": columns.move(actor, op.columnId, { position: op.position }); break;
    case "convertItem":
      if (op.to === "subitem") itemOps.convertToSubitem(actor, op.itemId, op.parentItemId ?? "");
      else itemOps.convertToItem(actor, op.itemId, { groupId: op.groupId });
      break;
  }
}

function replay(actor: Actor, ops: unknown[]): void {
  const parsed = ops.map((o) => parse(undoOpSchema, o));
  db.transaction(() => { for (const op of parsed) applyOp(actor, op); });
}

/** Undo the latest action of this user on this board. Returns its label, or null when empty. */
export function undo(actor: Actor, boardId: string): { label: string } | null {
  requireBoard(actor, boardId, "board:view"); // each replayed operation is permission-checked by its service
  const entry = db.select().from(undoEntries).where(and(mine(actor, boardId), eq(undoEntries.undone, false))).orderBy(desc(undoEntries.createdAt), desc(undoEntries.id)).limit(1).get();
  if (!entry) return null;
  replay(actor, entry.undoOps);
  db.update(undoEntries).set({ undone: true }).where(eq(undoEntries.id, entry.id)).run();
  return { label: entry.label };
}

/** Re-apply the most recently undone action. */
export function redo(actor: Actor, boardId: string): { label: string } | null {
  requireBoard(actor, boardId, "board:view"); // each replayed operation is permission-checked by its service
  const entry = db.select().from(undoEntries).where(and(mine(actor, boardId), eq(undoEntries.undone, true))).orderBy(asc(undoEntries.createdAt), asc(undoEntries.id)).limit(1).get();
  if (!entry) return null;
  replay(actor, entry.redoOps);
  db.update(undoEntries).set({ undone: false }).where(eq(undoEntries.id, entry.id)).run();
  return { label: entry.label };
}

export function clear(actor: Actor, boardId: string): void {
  requireBoard(actor, boardId, "board:view");
  db.delete(undoEntries).where(mine(actor, boardId)).run();
}
