"use client";

import { createContext, useContext } from "react";
import type { BoardFull, ColumnDto, ItemDto } from "@/lib/board-types";
import type { ViewState } from "@/lib/view-state";
import type { BoardActions } from "../use-board";
import { getColumnUi } from "@/components/columns/registry";

export interface FocusCell { itemId: string; columnId: string }
export interface EditRequest extends FocusCell { nonce: number; /** first typed character */ char?: string }
export type DropTarget =
  | { kind: "row"; itemId: string; edge: "top" | "bottom" }
  | { kind: "group-end"; groupId: string }
  | { kind: "group-start"; groupId: string }
  | { kind: "group"; groupId: string; edge: "top" | "bottom" };

export interface TableCtx {
  board: BoardFull;
  actions: BoardActions;
  viewState: ViewState;
  setViewState: (patch: Partial<ViewState>) => void;
  canEdit: boolean;
  canEditStructure: boolean;
  openItemId: string | null;
  onOpenItem: (id: string | null) => void;
  editItemId: string | null;
  setEditItemId: (id: string | null) => void;
  /** visible, NOT pinned data columns of the main table (without the name column) */
  columns: ColumnDto[];
  /** pinned columns (sticky, right after the name column) */
  pinned: ColumnDto[];
  nameColumn: ColumnDto | undefined;
  nameWidth: number;
  /** width of the sticky left block: strip + checkbox + name + pinned columns */
  leftWidth: number;
  subColumns: ColumnDto[];
  subNameColumn: ColumnDto | undefined;
  subitemsOf: (itemId: string) => ItemDto[];
  widthOf: (c: ColumnDto) => number;
  setWidth: (columnId: string, width: number) => void;

  /* selection */
  selected: Set<string>;
  toggleSelect: (itemId: string, shift?: boolean) => void;
  setSelection: (ids: string[], on: boolean) => void;
  /* keyboard focus + editing */
  focus: FocusCell | null;
  setFocus: (f: FocusCell | null) => void;
  editRequest: EditRequest | null;
  clearEditRequest: () => void;
  /* drag and drop */
  dragEnabled: boolean;
  dragging: { type: "item" | "group"; id: string } | null;
  dropTarget: DropTarget | null;
  /* misc */
  unread: Record<string, number>;
  /** ids of every item row in display order (for range select / navigation) */
  rowOrder: string[];
}

const Ctx = createContext<TableCtx | null>(null);
export const TableProvider = Ctx.Provider;
export function useTable(): TableCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTable outside TableProvider");
  return v;
}

export const LEFT_STRIP = 6;
export const LEFT_CHECK = 34;
export const DEFAULT_NAME_WIDTH = 352;
/** narrow column after the name holding the update bubble */
export const CHAT_WIDTH = 65;
export const ADD_COL_WIDTH = 56;

export const defaultWidthFor = (c: ColumnDto): number => c.width ?? getColumnUi(c.type).defaultWidth ?? 140;

/** grid-template-columns for a row: sticky-left block, data columns, "+" column */
export function gridTemplate(leftWidth: number, cols: ColumnDto[], widthOf: (c: ColumnDto) => number, withAdd = true): string {
  return `${leftWidth}px ${cols.map((c) => `${widthOf(c)}px`).join(" ")}${withAdd ? ` ${ADD_COL_WIDTH}px` : ""}`.trim();
}
