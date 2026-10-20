"use client";

import { api } from "@/lib/api-client";
import type { BoardFull, ColumnDto, ItemDto } from "@/lib/board-types";
import { getColumnLogic } from "@/server/columns/registry";
import { computePosition } from "./position";
import { recordUndo, type UndoOp } from "./undo-client";
import type { BoardActions, BulkResult, Core } from "./types";

type ItemRowResponse = Omit<ItemDto, "subitemCount" | "updateCount"> & Partial<Pick<ItemDto, "subitemCount" | "updateCount">>;
export const toItemDto = (r: ItemRowResponse): ItemDto => ({ ...r, subitemCount: r.subitemCount ?? 0, updateCount: r.updateCount ?? 0 });
export const asRef = (c: ColumnDto) => ({ id: c.id, key: c.key, title: c.title, type: c.type, settings: c.settings });

const mapItems = (d: BoardFull, fn: (i: ItemDto) => ItemDto | null): BoardFull => ({ ...d, items: d.items.map(fn).filter(Boolean) as ItemDto[] });
const withValue = (i: ItemDto, columnId: string, stored: unknown): ItemDto => {
  const values = { ...i.values };
  if (stored === null || stored === undefined) delete values[columnId];
  else values[columnId] = stored;
  return { ...i, values };
};
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Item level actions: optimistic update + REST + undo entry. */
export function itemActions(core: Core): Pick<BoardActions, "createItem" | "renameItem" | "setValue" | "deleteItem" | "duplicateItem" | "archiveItem" | "moveItem" | "convertItem" | "bulk" | "exportBoard"> {
  const { boardId, getData, run, setError, refetchSoon, t } = core;
  const itemOf = (id: string) => getData().items.find((i) => i.id === id);
  const stateOp = (ids: string[], state: "active" | "archived" | "deleted"): UndoOp => ({ op: "setItemState", itemIds: ids, state });
  const family = (id: string) => [id, ...getData().items.filter((i) => i.parentItemId === id).map((i) => i.id)];

  const siblingsFor = (d: BoardFull, it: ItemDto, groupId: string | null) =>
    d.items.filter((i) => i.id !== it.id && (it.parentItemId ? i.parentItemId === it.parentItemId : !i.parentItemId && i.groupId === groupId)).sort((a, b) => a.position - b.position);

  const self: ReturnType<typeof itemActions> = {
    async createItem({ groupId, name, afterId, top, parentItemId }) {
      const res = await run(null, () => api.post<ItemRowResponse>("/api/v1/items", { boardId, groupId, name, afterId, top, parentItemId }), (r, d) => ({
        ...d,
        items: d.items.some((i) => i.id === r.id) ? d.items : [...d.items, toItemDto(r)].map((i) => (parentItemId && i.id === parentItemId ? { ...i, subitemCount: i.subitemCount + 1 } : i)),
      }));
      if (res) {
        void recordUndo(boardId, t("undo.create"), [stateOp([res.id], "deleted")], [stateOp([res.id], "active")]);
        await refetchSoon();
      }
      return res ? toItemDto(res) : null;
    },
    async renameItem(itemId, name) {
      const prev = itemOf(itemId)?.name;
      const ok = await run((d) => mapItems(d, (i) => (i.id === itemId ? { ...i, name } : i)), () => api.patch(`/api/v1/items/${itemId}`, { name }));
      if (ok !== null && prev !== undefined && prev !== name) void recordUndo(boardId, t("undo.rename"), [{ op: "rename", itemId, name: prev }], [{ op: "rename", itemId, name }]);
    },
    async setValue(itemId, columnId, input) {
      const d = getData();
      const col = d.columns.find((c) => c.id === columnId);
      const it = d.items.find((i) => i.id === itemId);
      if (!col || !it) return;
      if (col.type === "name") return self.renameItem(itemId, String(input ?? ""));
      let stored: unknown;
      try {
        stored = getColumnLogic(col.type).validate(input, asRef(col));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return;
      }
      const prev = it.values[columnId] ?? null;
      if (same(prev, stored)) return;
      const ok = await run((cur) => mapItems(cur, (i) => (i.id === itemId ? withValue(i, columnId, stored) : i)), () => api.put(`/api/v1/items/${itemId}/values`, { [columnId]: input }));
      if (ok !== null) void recordUndo(boardId, t("undo.value"), [{ op: "setValues", itemId, values: { [columnId]: prev } }], [{ op: "setValues", itemId, values: { [columnId]: stored ?? null } }]);
    },
    async deleteItem(itemId) {
      const ids = family(itemId);
      const ok = await run((d) => mapItems(d, (i) => (ids.includes(i.id) ? null : i)), () => api.del(`/api/v1/items/${itemId}`));
      if (ok !== null) void recordUndo(boardId, t("undo.delete"), [stateOp([itemId], "active")], [stateOp([itemId], "deleted")]);
    },
    async duplicateItem(itemId) {
      const copy = await run(null, () => api.post<ItemRowResponse>(`/api/v1/items/${itemId}/duplicate`, {}));
      if (copy) void recordUndo(boardId, t("undo.duplicate"), [stateOp([copy.id], "deleted")], [stateOp([copy.id], "active")]);
      await refetchSoon();
    },
    async archiveItem(itemId) {
      const ids = family(itemId);
      const ok = await run((d) => mapItems(d, (i) => (ids.includes(i.id) ? null : i)), () => api.post(`/api/v1/items/${itemId}/archive`, {}));
      if (ok !== null) void recordUndo(boardId, t("undo.archive"), [stateOp([itemId], "active")], [stateOp([itemId], "archived")]);
    },
    async moveItem(itemId, to) {
      const it = itemOf(itemId);
      if (!it) return;
      if (to.boardId && to.boardId !== boardId) {
        const ids = family(itemId);
        await run((d) => mapItems(d, (i) => (ids.includes(i.id) ? null : i)), () => api.post(`/api/v1/items/${itemId}/move`, to));
        return;
      }
      const groupId = it.parentItemId ? it.groupId : (to.groupId ?? it.groupId);
      const pos = computePosition(siblingsFor(getData(), it, groupId), to);
      const prev = { groupId: it.groupId, position: it.position };
      if (prev.groupId === groupId && prev.position === pos) return;
      const body = { ...(it.parentItemId ? {} : { groupId }), position: pos };
      const ok = await run(
        (d) => mapItems(d, (i) => (i.id === itemId ? { ...i, groupId, position: pos } : i.parentItemId === itemId ? { ...i, groupId } : i)),
        () => api.post(`/api/v1/items/${itemId}/move`, body),
      );
      if (ok !== null) {
        const mk = (g: string | null, p: number): UndoOp => ({ op: "moveItem", itemId, ...(g && !it.parentItemId ? { groupId: g } : {}), position: p });
        void recordUndo(boardId, t("undo.move"), [mk(prev.groupId, prev.position)], [mk(groupId, pos)]);
      }
    },
    async convertItem(itemId, to) {
      const it = itemOf(itemId);
      if (!it) return;
      const undo: UndoOp = it.parentItemId ? { op: "convertItem", itemId, to: "subitem", parentItemId: it.parentItemId } : { op: "convertItem", itemId, to: "item", ...(it.groupId ? { groupId: it.groupId } : {}) };
      const ok = await run(null, () => api.post(`/api/v1/items/${itemId}/convert`, to));
      await refetchSoon();
      if (ok !== null) void recordUndo(boardId, t("undo.convert"), [undo], [to.to === "subitem" ? { op: "convertItem", itemId, to: "subitem", parentItemId: to.parentItemId } : { op: "convertItem", itemId, to: "item", ...(to.groupId ? { groupId: to.groupId } : {}) }]);
    },
    async bulk(op) {
      const d = getData();
      const ids = [...new Set(op.itemIds)];
      const before = ids.map((id) => d.items.find((i) => i.id === id)).filter(Boolean) as ItemDto[];
      let apply: ((d: BoardFull) => BoardFull) | null = null;
      if (op.action === "archive" || op.action === "delete") apply = (cur) => mapItems(cur, (i) => (ids.includes(i.id) || (i.parentItemId && ids.includes(i.parentItemId)) ? null : i));
      else if (op.action === "move" && !op.boardId) {
        const gid = op.groupId;
        let base = Math.max(0, ...d.items.filter((i) => !i.parentItemId && i.groupId === gid).map((i) => i.position));
        const pos = new Map(ids.map((id) => [id, (base += 1000)]));
        apply = (cur) => mapItems(cur, (i) => (pos.has(i.id) ? { ...i, groupId: gid ?? i.groupId, position: pos.get(i.id)! } : i));
      } else if (op.action === "move" && op.boardId) apply = (cur) => mapItems(cur, (i) => (ids.includes(i.id) || (i.parentItemId && ids.includes(i.parentItemId)) ? null : i));
      let storedNew: unknown = null;
      if (op.action === "update") {
        const col = d.columns.find((c) => c.id === op.columnId);
        if (!col) return null;
        try {
          storedNew = getColumnLogic(col.type).validate(op.value, asRef(col));
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
          return null;
        }
        apply = (cur) => mapItems(cur, (i) => (ids.includes(i.id) ? withValue(i, op.columnId, storedNew) : i));
      }
      const res = await run<BulkResult>(apply, () => api.post(`/api/v1/boards/${boardId}/bulk`, op));
      if (!res) return null;
      if (!apply || op.action === "duplicate") await refetchSoon();
      const label = t("undo.bulk");
      if (op.action === "archive") void recordUndo(boardId, label, [stateOp(ids, "active")], [stateOp(ids, "archived")]);
      else if (op.action === "delete") void recordUndo(boardId, label, [stateOp(ids, "active")], [stateOp(ids, "deleted")]);
      else if (op.action === "restore") void recordUndo(boardId, label, [stateOp(ids, "deleted")], [stateOp(ids, "active")]);
      else if (op.action === "duplicate" && res.createdIds?.length) void recordUndo(boardId, label, [stateOp(res.createdIds, "deleted")], [stateOp(res.createdIds, "active")]);
      else if (op.action === "update") {
        const u = op as { columnId: string };
        void recordUndo(boardId, label, before.map((i) => ({ op: "setValues", itemId: i.id, values: { [u.columnId]: i.values[u.columnId] ?? null } })), before.map((i) => ({ op: "setValues", itemId: i.id, values: { [u.columnId]: storedNew ?? null } })));
      } else if (op.action === "move" && !op.boardId) {
        const after = ids.map((id) => getData().items.find((i) => i.id === id)).filter(Boolean) as ItemDto[];
        void recordUndo(boardId, label, before.map((i) => ({ op: "moveItem", itemId: i.id, ...(i.groupId ? { groupId: i.groupId } : {}), position: i.position })), after.map((i) => ({ op: "moveItem", itemId: i.id, ...(i.groupId ? { groupId: i.groupId } : {}), position: i.position })));
      }
      return res;
    },
    async exportBoard(o) {
      try {
        const res = await fetch(`/api/v1/boards/${boardId}/export`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(o), credentials: "same-origin" });
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error?.message ?? res.statusText);
        const name = decodeURIComponent(res.headers.get("X-Filename") ?? `export.${o.format}`);
        const url = URL.createObjectURL(await res.blob());
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
  };
  return self;
}
