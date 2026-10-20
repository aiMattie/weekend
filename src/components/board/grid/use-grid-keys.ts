"use client";

import { useCallback, type KeyboardEvent } from "react";
import type { ColumnDto, ItemDto } from "@/lib/board-types";
import { getColumnLogic } from "@/server/columns/registry";
import type { BoardActions } from "../use-board";
import type { FocusCell } from "../table/table-context";

interface Opts {
  rowOrder: string[];
  colOrder: ColumnDto[];
  itemsById: Map<string, ItemDto>;
  actions: BoardActions;
  canEdit: boolean;
  focus: FocusCell | null;
  setFocus: (f: FocusCell | null) => void;
  requestEdit: (f: FocusCell, char?: string) => void;
  toggleSelect: (id: string, shift?: boolean) => void;
  selected: Set<string>;
  clearSelection: () => void;
  onOpenItem: (id: string | null) => void;
}

/** In-app cell clipboard (stored value + text); the text also goes to the system clipboard. */
let cellClipboard: { type: string; stored: unknown; text: string } | null = null;
export const getCellClipboard = () => cellClipboard;

const isTyping = (el: HTMLElement) => el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;

export function scrollCellIntoView(f: FocusCell) {
  const el = document.querySelector<HTMLElement>(`[data-cell-key="${f.itemId}:${f.columnId}"]`);
  el?.scrollIntoView({ block: "nearest", inline: "nearest" });
}

/** Keyboard handling for the grid: arrows, Enter, Esc, Tab, Delete, Ctrl+C/V, typing, Space. */
export function useGridKeys(o: Opts) {
  const { rowOrder, colOrder, itemsById, actions, canEdit, focus, setFocus, requestEdit, toggleSelect, selected, clearSelection } = o;

  const move = useCallback((dr: number, dc: number, from?: FocusCell | null): FocusCell | null => {
    const cur = from ?? focus;
    if (!cur) {
      if (!rowOrder.length || !colOrder.length) return null;
      return { itemId: rowOrder[0], columnId: colOrder[0].id };
    }
    const r = rowOrder.indexOf(cur.itemId);
    const c = colOrder.findIndex((x) => x.id === cur.columnId);
    if (r < 0 || c < 0) return null;
    const nr = Math.max(0, Math.min(rowOrder.length - 1, r + dr));
    const nc = Math.max(0, Math.min(colOrder.length - 1, c + dc));
    return { itemId: rowOrder[nr], columnId: colOrder[nc].id };
  }, [focus, rowOrder, colOrder]);

  const go = useCallback((f: FocusCell | null) => {
    if (!f) return;
    setFocus(f);
    scrollCellIntoView(f);
  }, [setFocus]);

  return useCallback((e: KeyboardEvent<HTMLElement>) => {
    if (!e.currentTarget.contains(e.target as Node)) return; // keys from portals (popover editors)
    const target = e.target as HTMLElement;
    const inCell = target.closest("[data-cell-key]") as HTMLElement | null;

    if (isTyping(target)) {
      // Tab inside an inline editor: commit (blur) and continue in the next cell
      if (e.key === "Tab" && inCell) {
        const [itemId, columnId] = inCell.dataset.cellKey!.split(":");
        e.preventDefault();
        target.blur();
        go(move(0, e.shiftKey ? -1 : 1, { itemId, columnId }));
      }
      return;
    }
    const mod = e.ctrlKey || e.metaKey;
    const col = focus ? colOrder.find((c) => c.id === focus.columnId) : undefined;
    const item = focus ? itemsById.get(focus.itemId) : undefined;

    switch (e.key) {
      case "ArrowDown": e.preventDefault(); go(move(1, 0)); return;
      case "ArrowUp": e.preventDefault(); go(move(-1, 0)); return;
      case "ArrowRight": e.preventDefault(); go(move(0, 1)); return;
      case "ArrowLeft": e.preventDefault(); go(move(0, -1)); return;
      case "Tab": if (focus) { e.preventDefault(); go(move(0, e.shiftKey ? -1 : 1)); } return;
      case "Escape":
        if (selected.size) clearSelection();
        else setFocus(null);
        return;
      case "Enter":
      case "F2":
        if (focus && canEdit) { e.preventDefault(); requestEdit(focus); }
        return;
      case "Delete":
      case "Backspace":
        if (focus && item && col && canEdit && col.type !== "name" && !getColumnLogic(col.type).readOnly) { e.preventDefault(); void actions.setValue(item.id, col.id, null); }
        return;
      case " ":
        if (focus) { e.preventDefault(); toggleSelect(focus.itemId, e.shiftKey); }
        return;
    }
    if (mod && e.key.toLowerCase() === "c" && focus && item && col) {
      const stored = col.type === "name" ? item.name : (item.values[col.id] ?? null);
      const text = col.type === "name" ? item.name : getColumnLogic(col.type).format(stored as never, { id: col.id, key: col.key, title: col.title, type: col.type, settings: col.settings });
      cellClipboard = { type: col.type, stored, text };
      void navigator.clipboard?.writeText(text).catch(() => undefined);
      e.preventDefault();
      return;
    }
    if (mod && e.key.toLowerCase() === "v" && focus && item && col && canEdit && !getColumnLogic(col.type).readOnly) {
      e.preventDefault();
      void (async () => {
        let sys: string | null = null;
        try { sys = (await navigator.clipboard?.readText()) ?? null; } catch { sys = null; }
        const cb = cellClipboard;
        if (cb && cb.type === col.type && (sys === null || sys === cb.text)) await actions.setValue(item.id, col.id, cb.stored);
        else if (sys !== null) await actions.setValue(item.id, col.id, sys);
        else if (cb) await actions.setValue(item.id, col.id, cb.text);
      })();
      return;
    }
    if (!mod && !e.altKey && e.key.length === 1 && focus && canEdit && col && !getColumnLogic(col.type).readOnly) {
      requestEdit(focus, e.key);
      e.preventDefault();
    }
  }, [focus, colOrder, itemsById, canEdit, actions, go, move, requestEdit, toggleSelect, selected, clearSelection, setFocus]);
}
