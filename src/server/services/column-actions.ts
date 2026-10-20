/** Column-specific actions that are not plain value writes: button click, time tracking, doc. */
import { z } from "zod";
import type { Actor } from "../../lib/actor";
import { ValidationError } from "../../lib/errors";
import { idSchema } from "../../lib/zod-schemas";
import { isTimeCommand, type TimeCommand } from "../columns/time_tracking";
import type { DocValue } from "../columns/doc";
import * as docs from "./docs";
import { changeColumnValue } from "./items";
import { getItemRow, parse, record, requireBoard, resolveColumn, type ColumnRow } from "./_shared";

function target(actor: Actor, itemId: string, columnRef: string, type: string) {
  const item = getItemRow(itemId);
  requireBoard(actor, item.boardId, "board:edit_items");
  const col: ColumnRow = resolveColumn(item.boardId, columnRef, item.parentItemId ? "subitem" : "item");
  if (col.type !== type) throw new ValidationError(`Column "${col.title}" is not a ${type} column`);
  return { item, col };
}

/** Button column click: emits `button.clicked` (automations listen to it). */
export function click(actor: Actor, itemId: string, columnRef: string): { ok: true } {
  const { item, col } = target(actor, itemId, columnRef, "button");
  record(actor, { type: "button.clicked", boardId: item.boardId, itemId, columnId: col.id }, { event: "button_clicked", itemId, columnId: col.id, data: { name: item.name, columnTitle: col.title } });
  return { ok: true };
}

/** Time tracking: start / stop / add / remove / reset (see time_tracking.ts). */
export function timeTracking(actor: Actor, itemId: string, columnRef: string, command: unknown): unknown {
  if (!isTimeCommand(command)) throw new ValidationError("Expected { command: start|stop|add|remove|reset }");
  const { col } = target(actor, itemId, columnRef, "time_tracking");
  return changeColumnValue(actor, itemId, col.id, command as TimeCommand);
}

/** Doc column: opens (creates on first use) the WorkDoc of this cell and links it. Returns the doc id. */
export function docOpen(actor: Actor, itemId: string, columnRef: string, opts: { createNew?: boolean } = {}): { docId: string } {
  const { item, col } = target(actor, itemId, columnRef, "doc");
  const cur = (item.values[col.id] as DocValue | undefined)?.files ?? [];
  if (cur.length && !opts.createNew) return { docId: cur[0].objectId };
  const doc = docs.create(actor, { itemId, columnId: col.id });
  changeColumnValue(actor, itemId, col.id, { files: [...cur, { objectId: doc.id, fileType: "DOC", name: doc.title }] });
  return { docId: doc.id };
}

const actionSchema = z.object({ action: z.enum(["click", "start", "stop", "add", "remove", "reset", "open_doc", "new_doc"]), seconds: z.number().optional(), startedAt: z.string().optional(), note: z.string().max(500).optional(), id: z.string().optional() });

/** Single entry for the REST route `POST /api/v1/items/:id/values/:columnId/action`. */
export function run(actor: Actor, itemId: string, columnRef: string, input: unknown): unknown {
  idSchema.parse(itemId);
  const a = parse(actionSchema, input);
  switch (a.action) {
    case "click": return click(actor, itemId, columnRef);
    case "open_doc": return docOpen(actor, itemId, columnRef);
    case "new_doc": return docOpen(actor, itemId, columnRef, { createNew: true });
    case "add": return timeTracking(actor, itemId, columnRef, { command: "add", seconds: a.seconds, startedAt: a.startedAt, note: a.note });
    case "remove": return timeTracking(actor, itemId, columnRef, { command: "remove", id: a.id });
    default: return timeTracking(actor, itemId, columnRef, { command: a.action });
  }
}
