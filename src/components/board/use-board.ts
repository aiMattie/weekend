"use client";

/* eslint-disable react-hooks/refs -- `getData` closes over a ref and is only called from event handlers, never during render */

/**
 * Client state for one board: holds the `BoardFull` snapshot, exposes optimistic actions that call
 * the REST API (src/app/api/v1/**) and keeps the snapshot fresh through SSE (use-board-events).
 * Every view component receives `actions` through ViewProps; add new actions in grid/*-actions.ts
 * (additive) and to the BoardActions interface in grid/types.ts.
 *
 * - `run()` applies an optimistic change, sends the request and rolls back (refetch) on failure.
 *   While requests are in flight SSE refetches are held back (`pending`) so they never clobber
 *   optimistic state; one refetch runs when the last request settles.
 * - Undo/redo: actions record their inverse on the server undo stack (grid/undo-client.ts);
 *   Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y replay it (outside text inputs).
 * - Unread update counts and the toast line live in grid/runtime-store.ts (`useBoardRuntime`).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import type { BoardFull } from "@/lib/board-types";
import { useT } from "@/lib/i18n/client";
import { itemActions } from "./grid/item-actions";
import { patchRuntime } from "./grid/runtime-store";
import { structureActions } from "./grid/structure-actions";
import type { BoardActions, Core } from "./grid/types";
import { replayUndo } from "./grid/undo-client";
import { useBoardEvents } from "./use-board-events";

export type { BoardActions, BulkAction, BulkResult, ConvertTarget } from "./grid/types";

const isTyping = (el: EventTarget | null): boolean => {
  const n = el as HTMLElement | null;
  if (!n || !n.tagName) return false;
  return n.tagName === "INPUT" || n.tagName === "TEXTAREA" || n.tagName === "SELECT" || n.isContentEditable;
};

export function useBoard(initial: BoardFull) {
  const boardId = initial.board.id;
  const t = useT();
  const tRef = useRef(t);
  const [data, setData] = useState<BoardFull>(initial);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(0);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    tRef.current = t;
  });

  // new board (client navigation) -> reset snapshot
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setData(initial), [initial]);

  const loadUnread = useCallback(async () => {
    try {
      patchRuntime(boardId, { unread: await api.get<Record<string, number>>(`/api/v1/boards/${boardId}/unread`) });
    } catch {
      /* optional */
    }
  }, [boardId]);

  const doRefetch = useCallback(async () => {
    if (pending.current > 0) {
      dirty.current = true;
      return;
    }
    try {
      const [fresh] = await Promise.all([api.get<BoardFull>(`/api/v1/boards/${boardId}/full`), loadUnread()]);
      if (pending.current > 0) {
        dirty.current = true;
        return;
      }
      setData((cur) => (JSON.stringify(cur) === JSON.stringify(fresh) ? cur : fresh));
    } catch {
      /* ignore transient errors; SSE will retry */
    }
  }, [boardId, loadUnread]);

  const scheduleRefetch = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void doRefetch(), 150);
  }, [doRefetch]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => { void loadUnread(); }, [loadUnread]);
  useBoardEvents(boardId, scheduleRefetch);

  /** optimistic: apply `apply` to the snapshot, run the request, roll back (refetch) on failure. */
  const run = useCallback(async <T,>(apply: ((d: BoardFull) => BoardFull) | null, request: () => Promise<T>, after?: (res: T, d: BoardFull) => BoardFull): Promise<T | null> => {
    pending.current += 1;
    if (apply) setData(apply);
    try {
      const res = await request();
      if (after) setData((d) => after(res, d));
      return res;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      dirty.current = true;
      return null;
    } finally {
      pending.current -= 1;
      if (pending.current === 0 && dirty.current) {
        dirty.current = false;
        scheduleRefetch();
      }
    }
  }, [scheduleRefetch]);

  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  });

  const actions = useMemo<BoardActions>(() => {
    const refetchSoon = async () => {
      await new Promise((r) => setTimeout(r, 0));
      await doRefetch();
    };
    const core: Core = { boardId, getData: () => dataRef.current, run, setError: (m) => setError(m), refetch: doRefetch, refetchSoon, t: (k) => tRef.current(k) };
    const texts = () => ({ undone: tRef.current("undo.undone"), redone: tRef.current("undo.redone"), nothing: tRef.current("undo.nothing"), failed: tRef.current("undo.failed") });
    const replay = async (kind: "undo" | "redo") => {
      // wait for in-flight requests so the undo entry of the last action exists
      for (let i = 0; i < 40 && pending.current > 0; i++) await new Promise((r) => setTimeout(r, 25));
      await new Promise((r) => setTimeout(r, 60));
      if (await replayUndo(boardId, kind, texts())) {
        dirty.current = false;
        await doRefetch();
      }
    };
    return {
      refetch: doRefetch,
      ...itemActions(core),
      ...structureActions(core),
      undo: () => replay("undo"),
      redo: () => replay("redo"),
    };
  }, [boardId, doRefetch, run]);

  const canEditRef = useRef(initial.permissions.editItems);
  useEffect(() => {
    canEditRef.current = data.permissions.editItems;
  }, [data.permissions.editItems]);

  // Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y (not while typing in an input or the update editor)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || isTyping(e.target) || !canEditRef.current) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); void actions.undo(); }
      else if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); void actions.redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [actions]);

  return { data, actions, error, clearError: () => setError(null) };
}
