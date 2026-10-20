import type { ColumnDto, ItemDto } from "@/lib/board-types";

/** Color of the status label an item has in `column` (null when not a status column or empty). */
export function statusColor(column: ColumnDto | undefined, item: ItemDto): string | null {
  if (!column || column.type !== "status") return null;
  const idx = (item.values[column.id] as { index?: number } | undefined)?.index;
  if (typeof idx !== "number") return null;
  return ((column.settings.labels as { id: number; color: string }[] | undefined) ?? []).find((l) => l.id === idx)?.color ?? null;
}

export const SERIES_COLORS = ["#579bfc", "#a25ddc", "#fdab3d", "#00c875", "#ff158a", "#66ccff", "#cab641", "#7f5347"];
