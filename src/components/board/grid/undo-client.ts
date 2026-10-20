"use client";

import { api } from "@/lib/api-client";
import { patchRuntime, showToast, type UndoState } from "./runtime-store";

/** Mirrors UndoOp in src/server/services/undo.ts (the server validates with zod). */
export type UndoOp =
  | { op: "setValues"; itemId: string; values: Record<string, unknown> }
  | { op: "rename"; itemId: string; name: string }
  | { op: "moveItem"; itemId: string; groupId?: string; position: number }
  | { op: "setItemState"; itemIds: string[]; state: "active" | "archived" | "deleted" }
  | { op: "moveGroup"; groupId: string; position: number }
  | { op: "updateGroup"; groupId: string; patch: { title?: string; color?: string } }
  | { op: "setGroupState"; groupId: string; state: "active" | "archived" | "deleted" }
  | { op: "moveColumn"; columnId: string; position: number }
  | { op: "convertItem"; itemId: string; to: "item" | "subitem"; parentItemId?: string; groupId?: string };

/** Records are sent one after another per board; undo/redo waits for the queue so Ctrl+Z right after an edit finds its entry. */
const queues = new Map<string, Promise<void>>();

/** Store an action on the server undo stack (best effort: a failed record never blocks the user). */
export function recordUndo(boardId: string, label: string, undo: UndoOp[], redo: UndoOp[]): Promise<void> {
  if (!undo.length || !redo.length) return Promise.resolve();
  const next = (queues.get(boardId) ?? Promise.resolve()).then(async () => {
    try {
      const st = await api.post<UndoState>(`/api/v1/boards/${boardId}/undo`, { action: "record", label, undo, redo });
      patchRuntime(boardId, { undo: st });
    } catch {
      /* ignore */
    }
  });
  queues.set(boardId, next);
  return next;
}

/** Run undo or redo; `texts` supplies the toast copy. Returns true when something was replayed. */
export async function replayUndo(boardId: string, kind: "undo" | "redo", texts: { undone: string; redone: string; nothing: string; failed: string }): Promise<boolean> {
  await (queues.get(boardId) ?? Promise.resolve());
  try {
    const res = await api.post<{ result: { label: string } | null; state: UndoState }>(`/api/v1/boards/${boardId}/undo`, { action: kind });
    patchRuntime(boardId, { undo: res.state });
    if (!res.result) {
      showToast(boardId, texts.nothing);
      return false;
    }
    showToast(boardId, `${kind === "undo" ? texts.undone : texts.redone}: ${res.result.label}`);
    return true;
  } catch (e) {
    showToast(boardId, `${texts.failed}: ${e instanceof Error ? e.message : ""}`, "error");
    return false;
  }
}
