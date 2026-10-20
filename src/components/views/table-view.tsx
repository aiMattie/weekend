"use client";

import { BoardTable } from "@/components/board/table/board-table";
import type { ViewProps } from "./types";

export function TableView(props: ViewProps) {
  return <BoardTable {...props} />;
}
