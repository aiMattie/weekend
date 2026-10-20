/** Column operations beyond plain create/update: change type (with value conversion). */
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "../../lib/actor";
import { ValidationError } from "../../lib/errors";
import { WEEKEND_COLORS } from "../../lib/colors";
import { db } from "../../db/client";
import { columns, items } from "../../db/schema/core";
import { dropdownLabels, statusLabels } from "../columns/labels";
import { getColumnLogic } from "../columns/registry";
import { formatContext, getColumnRow, parse, record, requireBoard, type ColumnRow } from "./_shared";

const NOT_CONVERTIBLE = new Set(["name", "subtasks"]);

/** Labels for a status/dropdown column built from the distinct texts of the old column. */
function labelsFromTexts(texts: string[], type: "status" | "dropdown") {
  const uniq = [...new Set(texts.filter(Boolean))];
  return uniq.map((text, i) => (type === "status" ? { id: i, text, color: WEEKEND_COLORS[(i * 3) % WEEKEND_COLORS.length].hex, index: i, isDone: false } : { id: i + 1, text }));
}

/**
 * Change a column's type and convert every stored value: through the old type's text (`format`) and the
 * new type's `validate`; status <-> dropdown keep their labels. Values that do not convert are dropped.
 */
export function changeType(actor: Actor, columnId: string, input: unknown): ColumnRow {
  const d = parse(z.object({ type: z.string().min(1).max(60) }), input);
  const cur = getColumnRow(columnId);
  requireBoard(actor, cur.boardId, "board:edit_structure");
  if (NOT_CONVERTIBLE.has(cur.type) || NOT_CONVERTIBLE.has(d.type)) throw new ValidationError("This column type cannot be changed");
  if (cur.type === d.type) return cur;
  const from = getColumnLogic(cur.type);
  const to = getColumnLogic(d.type);
  const rows = db.select({ id: items.id, values: items.values, parent: items.parentItemId }).from(items).where(eq(items.boardId, cur.boardId)).all()
    .filter((r) => (cur.scope === "subitem") === !!r.parent);
  const fmt = formatContext(actor.accountId);
  const curRef = { id: cur.id, key: cur.key, title: cur.title, type: cur.type, settings: cur.settings };
  const textOf = (v: unknown) => from.format(v as never, curRef, fmt);

  const settings: Record<string, unknown> = { ...to.defaultSettings() };
  if (d.type === "status" || d.type === "dropdown") {
    if (cur.type === "status" || cur.type === "dropdown") {
      const old = cur.type === "status" ? statusLabels(cur.settings) : dropdownLabels(cur.settings);
      settings.labels = d.type === "status"
        ? old.map((l, i) => ({ id: l.id, text: l.text, color: (l as { color?: string }).color ?? WEEKEND_COLORS[(i * 3) % WEEKEND_COLORS.length].hex, index: i, isDone: false }))
        : old.map((l) => ({ id: l.id, text: l.text }));
    } else settings.labels = labelsFromTexts(rows.map((r) => textOf(r.values[cur.id] ?? null)), d.type);
  }
  const normalized = to.normalizeSettings ? to.normalizeSettings(settings) : settings;
  const newRef = { ...curRef, type: d.type, settings: normalized };

  db.transaction((tx) => {
    for (const r of rows) {
      const v = r.values[cur.id];
      if (v === undefined) continue;
      let next: unknown = null;
      try {
        if (to.readOnly) next = null;
        else if (cur.type === "status" && d.type === "dropdown") next = { ids: [(v as { index: number }).index] };
        else if (cur.type === "dropdown" && d.type === "status") next = { index: (v as { ids: number[] }).ids[0] };
        else next = to.validate(textOf(v), newRef);
      } catch {
        next = null;
      }
      const values = { ...r.values };
      if (next === null || next === undefined) delete values[cur.id];
      else values[cur.id] = next;
      tx.update(items).set({ values }).where(eq(items.id, r.id)).run();
    }
    tx.update(columns).set({ type: d.type, settings: normalized }).where(eq(columns.id, columnId)).run();
  });
  record(actor, { type: "column.updated", boardId: cur.boardId, columnId }, { event: "change_column_type", columnId, data: { title: cur.title, from: cur.type, to: d.type } });
  return getColumnRow(columnId);
}
