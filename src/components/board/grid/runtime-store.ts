"use client";

/**
 * Small per-board runtime store shared by use-board (writes) and the table (reads): unread update
 * counts, undo/redo availability and the toast line. Lives outside React so views that do not
 * receive extra props through ViewProps can still read it with `useBoardRuntime(boardId)`.
 */
import { useSyncExternalStore } from "react";

export interface UndoState { canUndo: boolean; canRedo: boolean; undoLabel: string | null; redoLabel: string | null }
export interface Toast { id: number; text: string; kind: "info" | "error" }
export interface BoardRuntime { unread: Record<string, number>; undo: UndoState; toast: Toast | null }

const EMPTY: BoardRuntime = { unread: {}, undo: { canUndo: false, canRedo: false, undoLabel: null, redoLabel: null }, toast: null };
const states = new Map<string, BoardRuntime>();
const listeners = new Map<string, Set<() => void>>();
let toastSeq = 0;

const get = (boardId: string): BoardRuntime => states.get(boardId) ?? EMPTY;

export function patchRuntime(boardId: string, patch: Partial<BoardRuntime>): void {
  states.set(boardId, { ...get(boardId), ...patch });
  listeners.get(boardId)?.forEach((l) => l());
}

let timer: ReturnType<typeof setTimeout> | null = null;
export function showToast(boardId: string, text: string, kind: Toast["kind"] = "info"): void {
  patchRuntime(boardId, { toast: { id: ++toastSeq, text, kind } });
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => patchRuntime(boardId, { toast: null }), 5000);
}

export function useBoardRuntime(boardId: string): BoardRuntime {
  return useSyncExternalStore(
    (cb) => {
      if (!listeners.has(boardId)) listeners.set(boardId, new Set());
      listeners.get(boardId)!.add(cb);
      return () => listeners.get(boardId)?.delete(cb);
    },
    () => get(boardId),
    () => EMPTY,
  );
}
