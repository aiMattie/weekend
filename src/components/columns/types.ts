/**
 * CLIENT half of a column type (the server half is src/server/columns/<type>.ts).
 *
 * To add the UI of a column type:
 *   1. create `src/components/columns/<type>.tsx` ("use client") exporting a `ColumnUi`
 *      (`Cell` = read display, optional `Editor`),
 *   2. add ONE import + ONE entry in `src/components/columns/registry.ts`.
 *
 * The table shell (src/components/board/table/cell-shell.tsx) renders `Cell` and, when the user
 * clicks it (and the column has an `Editor` and the board is editable), mounts `Editor`:
 *   - editorMode "inline": Editor replaces the Cell until commit/cancel (text inputs),
 *   - editorMode "popover" (default): Cell stays, Editor renders its own <Popover anchorEl>.
 * Cells/Editors send RAW INPUT (what `ColumnLogic.validate` accepts); the server validates.
 */
import type { ComponentType } from "react";
import type { BoardFull, ColumnDto, ItemDto } from "@/lib/board-types";

export interface CellContext {
  board: BoardFull;
  column: ColumnDto;
  item: ItemDto;
  /** the user may not edit this item (viewer, read-only column, ...) */
  readOnly: boolean;
  /** subitems of `item` (only filled for top-level items) */
  subitems: ItemDto[];
}

export interface CellProps<V = unknown> extends CellContext {
  /** stored value (see the server logic file for the shape); null = empty */
  value: V | null;
  /** commit raw input directly (checkbox toggles, clear buttons) */
  onChange: (input: unknown) => void;
}

export interface EditorProps<V = unknown> extends CellContext {
  value: V | null;
  /** commit raw input; closes the editor unless `keepOpen` (multi-selects) */
  onCommit: (input: unknown, opts?: { keepOpen?: boolean }) => void;
  onCancel: () => void;
  /** the cell element, for popover editors */
  anchorEl: HTMLElement | null;
}

export interface ColumnUi<V = unknown> {
  Cell: ComponentType<CellProps<V>>;
  Editor?: ComponentType<EditorProps<V>>;
  /** default "popover" */
  editorMode?: "inline" | "popover";
  /** horizontal alignment of the Cell content (default "center" for status-like, "left" for text) */
  align?: "left" | "center";
  /** default column width in px */
  defaultWidth?: number;
}
