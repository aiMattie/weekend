"use client";

import { useMemo } from "react";
import type { BoardFull, ItemDto } from "@/lib/board-types";
import { formatContext, itemMatches, sortItems, type ViewState } from "@/lib/view-state";

/** Top-level items that pass the board toolbar (search, person, filters) in the view's sort order. */
export function useVisibleItems(board: BoardFull, viewState: ViewState): ItemDto[] {
  return useMemo(() => {
    const ctx = formatContext(board.users);
    const top = board.items.filter((i) => !i.parentItemId && itemMatches(i, board.columns, viewState, ctx));
    return sortItems(top, board.columns, viewState.sort, ctx);
  }, [board.items, board.columns, board.users, viewState]);
}
