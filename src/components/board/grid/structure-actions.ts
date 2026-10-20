"use client";

import { api } from "@/lib/api-client";
import type { BoardFull, GroupDto, ViewDto } from "@/lib/board-types";
import { computePosition } from "./position";
import { recordUndo, type UndoOp } from "./undo-client";
import type { BoardActions, Core } from "./types";

type StructureKeys = "createGroup" | "updateGroup" | "moveGroup" | "deleteGroup" | "archiveGroup" | "duplicateGroup" | "createColumn" | "updateColumn" | "moveColumn" | "deleteColumn" | "duplicateColumn" | "updateBoard" | "toggleFavorite" | "createView" | "updateView" | "deleteView";

/** Group / column / board / view actions (optimistic + REST + undo entries for groups and columns). */
export function structureActions(core: Core): Pick<BoardActions, StructureKeys> {
  const { boardId, getData, run, refetchSoon, t } = core;
  const sortedGroups = (d: BoardFull, except?: string) => [...d.groups].filter((g) => g.id !== except).sort((a, b) => a.position - b.position);
  const sortedCols = (d: BoardFull, scope: string, except?: string) => d.columns.filter((c) => c.scope === scope && c.id !== except).sort((a, b) => a.position - b.position);

  return {
    async createGroup(o) {
      const res = await run(null, () => api.post<GroupDto>(`/api/v1/boards/${boardId}/groups`, { title: o?.title ?? "New group", top: o?.top ?? (o?.afterId || o?.beforeId ? undefined : true), afterId: o?.afterId, beforeId: o?.beforeId }));
      await refetchSoon();
      if (res) void recordUndo(boardId, t("undo.createGroup"), [{ op: "setGroupState", groupId: res.id, state: "deleted" }], [{ op: "setGroupState", groupId: res.id, state: "active" }]);
      return res;
    },
    async updateGroup(groupId, patch) {
      const prev = getData().groups.find((g) => g.id === groupId);
      const ok = await run((d) => ({ ...d, groups: d.groups.map((g) => (g.id === groupId ? { ...g, ...patch } : g)) }), () => api.patch(`/api/v1/groups/${groupId}`, patch));
      if (ok !== null && prev) {
        const old: { title?: string; color?: string } = {};
        if (patch.title !== undefined) old.title = prev.title;
        if (patch.color !== undefined) old.color = prev.color;
        void recordUndo(boardId, t("undo.updateGroup"), [{ op: "updateGroup", groupId, patch: old }], [{ op: "updateGroup", groupId, patch }]);
      }
    },
    async moveGroup(groupId, to) {
      const cur = getData().groups.find((g) => g.id === groupId);
      if (!cur) return;
      const pos = computePosition(sortedGroups(getData(), groupId), to);
      if (pos === cur.position) return;
      const ok = await run((d) => ({ ...d, groups: d.groups.map((g) => (g.id === groupId ? { ...g, position: pos } : g)) }), () => api.post(`/api/v1/groups/${groupId}/move`, { position: pos }));
      if (ok !== null) void recordUndo(boardId, t("undo.moveGroup"), [{ op: "moveGroup", groupId, position: cur.position }], [{ op: "moveGroup", groupId, position: pos }]);
    },
    async deleteGroup(groupId) {
      const ok = await run((d) => ({ ...d, groups: d.groups.filter((g) => g.id !== groupId), items: d.items.filter((i) => i.groupId !== groupId) }), () => api.del(`/api/v1/groups/${groupId}`));
      if (ok !== null) void recordUndo(boardId, t("undo.deleteGroup"), [{ op: "setGroupState", groupId, state: "active" }], [{ op: "setGroupState", groupId, state: "deleted" }]);
    },
    async archiveGroup(groupId) {
      const ok = await run((d) => ({ ...d, groups: d.groups.filter((g) => g.id !== groupId), items: d.items.filter((i) => i.groupId !== groupId) }), () => api.post(`/api/v1/groups/${groupId}/archive`, {}));
      if (ok !== null) void recordUndo(boardId, t("undo.deleteGroup"), [{ op: "setGroupState", groupId, state: "active" }], [{ op: "setGroupState", groupId, state: "archived" }]);
    },
    async duplicateGroup(groupId) {
      const copy = await run(null, () => api.post<GroupDto>(`/api/v1/groups/${groupId}/duplicate`, {}));
      await refetchSoon();
      if (copy) void recordUndo(boardId, t("undo.createGroup"), [{ op: "setGroupState", groupId: copy.id, state: "deleted" }], [{ op: "setGroupState", groupId: copy.id, state: "active" }]);
    },
    createColumn: async (o) => { await run(null, () => api.post(`/api/v1/boards/${boardId}/columns`, o)); await refetchSoon(); },
    updateColumn: async (columnId, patch) => {
      await run((d) => ({ ...d, columns: d.columns.map((c) => (c.id === columnId ? { ...c, ...(patch.title ? { title: patch.title } : {}), ...(patch.width !== undefined ? { width: patch.width } : {}), ...(patch.settings ? { settings: { ...c.settings, ...patch.settings } } : {}) } : c)) }), () => api.patch(`/api/v1/columns/${columnId}`, patch));
    },
    async moveColumn(columnId, to) {
      const cur = getData().columns.find((c) => c.id === columnId);
      if (!cur) return;
      const pos = computePosition(sortedCols(getData(), cur.scope, columnId), to);
      if (pos === cur.position) return;
      const ok = await run((d) => ({ ...d, columns: d.columns.map((c) => (c.id === columnId ? { ...c, position: pos } : c)) }), () => api.post(`/api/v1/columns/${columnId}/move`, { position: pos }));
      if (ok !== null) void recordUndo(boardId, t("undo.moveColumn"), [{ op: "moveColumn", columnId, position: cur.position } as UndoOp], [{ op: "moveColumn", columnId, position: pos } as UndoOp]);
    },
    deleteColumn: async (columnId) => { await run((d) => ({ ...d, columns: d.columns.filter((c) => c.id !== columnId) }), () => api.del(`/api/v1/columns/${columnId}`)); },
    duplicateColumn: async (columnId) => { await run(null, () => api.post(`/api/v1/columns/${columnId}/duplicate`, {})); await refetchSoon(); },
    updateBoard: async (patch) => { await run((d) => ({ ...d, board: { ...d.board, ...patch } }), () => api.patch(`/api/v1/boards/${boardId}`, patch)); },
    toggleFavorite: async () => {
      await run((d) => ({ ...d, board: { ...d.board, isFavorite: !d.board.isFavorite } }), () => api.post(`/api/v1/boards/${boardId}/favorite`, {}));
      window.dispatchEvent(new Event("weekend:nav-changed"));
    },
    createView: (o) => run(null, () => api.post<ViewDto>(`/api/v1/boards/${boardId}/views`, o), (v, d) => ({ ...d, views: [...d.views, v] })),
    updateView: async (viewId, patch) => { await run((d) => ({ ...d, views: d.views.map((v) => (v.id === viewId ? ({ ...v, ...patch } as ViewDto) : v)) }), () => api.patch(`/api/v1/views/${viewId}`, patch)); },
    deleteView: async (viewId) => { await run((d) => ({ ...d, views: d.views.filter((v) => v.id !== viewId) }), () => api.del(`/api/v1/views/${viewId}`)); },
  };
}
