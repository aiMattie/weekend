import type { BoardFull, GroupDto, ItemDto, ViewDto } from "@/lib/board-types";
import type { PositionSpec } from "./position";

export type BulkAction =
  | { action: "duplicate" | "archive" | "delete" | "restore"; itemIds: string[] }
  | { action: "move"; itemIds: string[]; groupId?: string; boardId?: string }
  | { action: "update"; itemIds: string[]; columnId: string; value: unknown };
export interface BulkResult { action: string; count: number; itemIds: string[]; createdIds?: string[] }

export type ConvertTarget = { to: "subitem"; parentItemId: string } | { to: "item"; groupId?: string };

export interface BoardActions {
  refetch: () => Promise<void>;
  createItem: (o: { groupId: string; name: string; afterId?: string; top?: boolean; parentItemId?: string; values?: Record<string, unknown> }) => Promise<ItemDto | null>;
  renameItem: (itemId: string, name: string) => Promise<void>;
  setValue: (itemId: string, columnId: string, input: unknown) => Promise<void>;
  deleteItem: (itemId: string) => Promise<void>;
  duplicateItem: (itemId: string) => Promise<void>;
  archiveItem: (itemId: string) => Promise<void>;
  moveItem: (itemId: string, to: { groupId?: string; boardId?: string } & PositionSpec) => Promise<void>;
  convertItem: (itemId: string, to: ConvertTarget) => Promise<void>;
  bulk: (op: BulkAction) => Promise<BulkResult | null>;
  /** download CSV/Excel; `itemIds` in display order, `groupId` for one group */
  exportBoard: (o: { format: "csv" | "xlsx"; itemIds?: string[]; groupId?: string }) => Promise<void>;
  createGroup: (o?: { title?: string; top?: boolean; afterId?: string; beforeId?: string }) => Promise<GroupDto | null>;
  updateGroup: (groupId: string, patch: { title?: string; color?: string }) => Promise<void>;
  moveGroup: (groupId: string, to: PositionSpec) => Promise<void>;
  deleteGroup: (groupId: string) => Promise<void>;
  archiveGroup: (groupId: string) => Promise<void>;
  duplicateGroup: (groupId: string) => Promise<void>;
  createColumn: (o: { title: string; type: string; settings?: Record<string, unknown> }) => Promise<void>;
  updateColumn: (columnId: string, patch: { title?: string; settings?: Record<string, unknown>; width?: number | null }) => Promise<void>;
  moveColumn: (columnId: string, to: PositionSpec) => Promise<void>;
  deleteColumn: (columnId: string) => Promise<void>;
  duplicateColumn: (columnId: string) => Promise<void>;
  updateBoard: (patch: { name?: string; description?: string | null }) => Promise<void>;
  toggleFavorite: () => Promise<void>;
  createView: (o: { name: string; type: string }) => Promise<ViewDto | null>;
  updateView: (viewId: string, patch: { name?: string; settings?: Record<string, unknown>; filters?: unknown[]; sort?: unknown[] }) => Promise<void>;
  deleteView: (viewId: string) => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

/** Shared plumbing handed to the action factories (see use-board.ts). */
export interface Core {
  boardId: string;
  /** latest snapshot (read inside event handlers, never during render) */
  getData: () => BoardFull;
  run: <T>(apply: ((d: BoardFull) => BoardFull) | null, request: () => Promise<T>, after?: (res: T, d: BoardFull) => BoardFull) => Promise<T | null>;
  setError: (msg: string) => void;
  refetch: () => Promise<void>;
  refetchSoon: () => Promise<void>;
  /** i18n */
  t: (key: string) => string;
}
