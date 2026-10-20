import type { ColumnDto, ItemDto } from "@/lib/board-types";
import { isRangeColumn, rangeFromValue, type CalEvent } from "./dates";

/** All calendar entries: every visible item on every selected date/timeline column. */
export function buildCalEvents(items: ItemDto[], dateColumns: ColumnDto[]): CalEvent[] {
  const out: CalEvent[] = [];
  for (const col of dateColumns) {
    if (!isRangeColumn(col.type)) continue;
    for (const item of items) {
      const range = rangeFromValue(col.type, item.values[col.id]);
      if (range) out.push({ id: `${item.id}:${col.id}`, itemId: item.id, columnId: col.id, range, resizable: col.type === "timeline" });
    }
  }
  return out;
}
