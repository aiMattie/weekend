"use client";

import { getColumnUi } from "@/components/columns/registry";
import type { BoardFull, ColumnDto, ItemDto } from "@/lib/board-types";

/** Read-only rendering of one column value with the table's own cell component. */
export function CellValue({ board, column, item }: { board: BoardFull; column: ColumnDto; item: ItemDto }) {
  const Cell = getColumnUi(column.type).Cell;
  const value = (item.values[column.id] ?? null) as never;
  return <Cell board={board} column={column} item={item} readOnly subitems={[]} value={value} onChange={() => undefined} />;
}
