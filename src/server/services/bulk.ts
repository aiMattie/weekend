/** Bulk actions on a selection of items (multi-select bar in the table). */
import { z } from "zod";
import type { Actor } from "../../lib/actor";
import { eq } from "drizzle-orm";
import { NotFoundError, ValidationError } from "../../lib/errors";
import { idSchema } from "../../lib/zod-schemas";
import { db } from "../../db/client";
import { items as itemsTable } from "../../db/schema/core";
import { getItemRow, parse, requireBoard, resolveColumn } from "./_shared";
import * as items from "./items";

const ids = z.array(idSchema).min(1, "Select at least one item").max(2000);

export const bulkInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("duplicate"), itemIds: ids }),
  z.object({ action: z.literal("archive"), itemIds: ids }),
  z.object({ action: z.literal("delete"), itemIds: ids }),
  z.object({ action: z.literal("restore"), itemIds: ids }),
  /** move to a group (same board) or another board (+ optional group) */
  z.object({ action: z.literal("move"), itemIds: ids, groupId: idSchema.optional(), boardId: idSchema.optional() }),
  /** set one column to the same raw value on every item (null clears) */
  z.object({ action: z.literal("update"), itemIds: ids, columnId: z.string().min(1), value: z.unknown() }),
]);
export type BulkInput = z.infer<typeof bulkInput>;
export interface BulkResult { action: BulkInput["action"]; count: number; itemIds: string[]; createdIds?: string[] }

/** All items must be on `boardId`. Everything runs in one transaction: all or nothing. */
export function apply(actor: Actor, boardId: string, input: unknown): BulkResult {
  const d = parse(bulkInput, input);
  requireBoard(actor, boardId, "board:view");
  const uniq = [...new Set(d.itemIds)];
  for (const id of uniq) {
    const row = db.select({ boardId: itemsTable.boardId }).from(itemsTable).where(eq(itemsTable.id, id)).get();
    if (!row) throw new NotFoundError("Item");
    if (row.boardId !== boardId) throw new ValidationError(`Item ${id} is not on this board`);
    requireBoard(actor, boardId, "board:edit_items", { itemId: id }); // edit_assigned boards: per item
  }
  const created: string[] = [];
  db.transaction(() => {
    for (const id of uniq) {
      switch (d.action) {
        case "duplicate": created.push(items.duplicate(actor, id).id); break;
        case "archive": items.archive(actor, id); break;
        case "delete": items.remove(actor, id); break;
        case "restore": items.restore(actor, id); break;
        case "move": {
          // subitems follow their parent; reorder-only moves of subitems make no sense in bulk
          if (getItemRow(id).parentItemId) throw new ValidationError("Subitems cannot be moved in bulk");
          items.move(actor, id, { groupId: d.groupId, boardId: d.boardId });
          break;
        }
        case "update": {
          const col = resolveColumn(boardId, d.columnId, getItemRow(id).parentItemId ? "subitem" : "item");
          items.changeMultipleColumnValues(actor, id, { [col.id]: d.value ?? null });
          break;
        }
      }
    }
  });
  return { action: d.action, count: uniq.length, itemIds: uniq, ...(created.length ? { createdIds: created } : {}) };
}
