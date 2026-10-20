"use client";

/**
 * Toolbar state per view as a DRAFT on top of the saved view (filters, sort, hidden columns,
 * group-by, pinned columns). Search and person filter live only in memory. The saveable part of a
 * draft is mirrored in sessionStorage so a reload does not lose it; "Save as new view" /
 * "Save to this view" persist it through the views service, "Discard" drops it.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useCurrentUser } from "@/components/shell/user-context";
import { api } from "@/lib/api-client";
import type { ViewDto } from "@/lib/board-types";
import { emptyViewState, sameSavedPart, savedPart, stateFromView, type SavedPart, type ViewState } from "@/lib/view-state";

const storageKey = (boardId: string, viewId: string) => `weekend:vs:${boardId}:${viewId}`;
const readDraft = (boardId: string, viewId: string): SavedPart | null => {
  try {
    const raw = sessionStorage.getItem(storageKey(boardId, viewId));
    return raw ? (JSON.parse(raw) as SavedPart) : null;
  } catch { return null; }
};
const writeDraft = (boardId: string, viewId: string, part: SavedPart | null) => {
  try {
    if (part) sessionStorage.setItem(storageKey(boardId, viewId), JSON.stringify(part));
    else sessionStorage.removeItem(storageKey(boardId, viewId));
  } catch { /* storage unavailable */ }
};

interface Opts {
  boardId: string;
  view: ViewDto | undefined;
  canEditStructure: boolean;
  refetch: () => Promise<void>;
  selectView: (id: string) => void;
}

export function useViewStates({ boardId, view, canEditStructure, refetch, selectView }: Opts) {
  const me = useCurrentUser().id;
  const [drafts, setDrafts] = useState<Record<string, ViewState>>({});
  const [restored, setRestored] = useState<Record<string, boolean>>({});
  const viewId = view?.id ?? "";
  const base = useMemo(() => (view ? stateFromView(view) : emptyViewState()), [view]);
  const viewState = (viewId && drafts[viewId]) || base;
  const dirty = !!view && !sameSavedPart(viewState, base);

  // restore a draft that survived a reload (once per view, after mount: sessionStorage is client only)
  useEffect(() => {
    if (!viewId || restored[viewId]) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRestored((r) => ({ ...r, [viewId]: true }));
    const part = readDraft(boardId, viewId);
    if (part) setDrafts((d) => (d[viewId] ? d : { ...d, [viewId]: { ...base, ...part } }));
  }, [boardId, viewId, base, restored]);

  // mirror the saveable part of the draft
  useEffect(() => {
    if (!viewId || !restored[viewId]) return;
    writeDraft(boardId, viewId, dirty ? savedPart(viewState) : null);
  }, [boardId, viewId, restored, dirty, viewState]);

  const setViewState = useCallback((patch: Partial<ViewState>) => {
    if (!viewId) return;
    setDrafts((cur) => ({ ...cur, [viewId]: { ...(cur[viewId] ?? base), ...patch } }));
  }, [viewId, base]);

  const clearDraft = useCallback((id: string) => {
    setDrafts((cur) => { const { [id]: _drop, ...rest } = cur; return rest; }); // eslint-disable-line @typescript-eslint/no-unused-vars
    writeDraft(boardId, id, null);
  }, [boardId]);

  const canSaveToView = !!view && (view.ownerId === me || (view.ownerId === null && canEditStructure));

  const saveAsNew = useCallback(async (name: string, personal: boolean): Promise<ViewDto> => {
    if (!view) throw new Error("no view");
    const created = await api.post<ViewDto>(`/api/v1/boards/${boardId}/views/state`, {
      name, personal: personal || !canEditStructure, type: view.type, state: savedPart(viewState), settings: view.settings,
    });
    await refetch();
    clearDraft(view.id);
    selectView(created.id);
    return created;
  }, [view, boardId, viewState, canEditStructure, refetch, clearDraft, selectView]);

  const saveToView = useCallback(async () => {
    if (!view) return;
    await api.put(`/api/v1/views/${view.id}/state`, savedPart(viewState));
    await refetch();
    clearDraft(view.id);
  }, [view, viewState, refetch, clearDraft]);

  const discard = useCallback(() => { if (view) clearDraft(view.id); }, [view, clearDraft]);

  const clearAll = useCallback(() => setViewState({ search: "", personIds: [], filters: [], sort: [], groupByColumnId: null, hiddenColumnIds: [] }), [setViewState]);

  return { viewState, setViewState, dirty, canSaveToView, saveAsNew, saveToView, discard, clearAll };
}
