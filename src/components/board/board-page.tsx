"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ViewRenderer } from "@/components/views/registry";
import { ItemPanel } from "@/components/item-panel/item-panel";
import { useT } from "@/lib/i18n/client";
import { valuesFromFilters } from "@/lib/view-state";
import type { BoardFull } from "@/lib/board-types";
import { BoardHeader } from "./board-header";
import { Toolbar } from "./toolbar";
import { SavedViewBar } from "./toolbar/saved-view-bar";
import { useViewStates } from "./use-saved-views";
import { useBoard } from "./use-board";
import { ViewTabs } from "./view-tabs";
import styles from "./board-page.module.css";

/** `pulseItemId`: item opened through /boards/<id>/pulses/<itemId> (the panel opens on that item; closing it returns to /boards/<id>). */
export function BoardPage({ initial, pulseItemId }: { initial: BoardFull; pulseItemId?: string }) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const { data, actions, error, clearError } = useBoard(initial);
  const [viewId, setViewId] = useState<string>(initial.views.find((v) => v.id === search.get("view"))?.id ?? initial.views[0]?.id ?? "");
  const [editItemId, setEditItemId] = useState<string | null>(null);
  const [saveDialog, setSaveDialog] = useState(false);

  const view = data.views.find((v) => v.id === viewId) ?? data.views[0];
  const openItemId = search.get("item") ?? pulseItemId ?? null;
  const canEdit = data.permissions.editItems;
  const canEditStructure = data.permissions.editStructure;

  useEffect(() => {
    if (!error) return;
    const id = setTimeout(clearError, 5000);
    return () => clearTimeout(id);
  }, [error, clearError]);

  /** switch tab and keep `?view=<id>` in the URL so the link can be shared (views module) */
  const selectView = useCallback((id: string) => {
    setViewId(id);
    const sp = new URLSearchParams(window.location.search);
    sp.set("view", id);
    window.history.replaceState(null, "", `${window.location.pathname}?${sp.toString()}`);
  }, []);

  /** toolbar state = draft on top of the saved view (see use-saved-views.ts) */
  const { viewState, setViewState, dirty, canSaveToView, saveAsNew, saveToView, discard, clearAll } = useViewStates({
    boardId: data.board.id, view, canEditStructure, refetch: actions.refetch, selectView,
  });

  const onOpenItem = useCallback((id: string | null) => {
    const sp = new URLSearchParams(search.toString());
    if (id) sp.set("item", id);
    else sp.delete("item");
    const qs = sp.toString();
    const base = pulseItemId ? `/boards/${initial.board.id}` : pathname;
    router.replace(qs ? `${base}?${qs}` : base, { scroll: false });
  }, [router, pathname, search, pulseItemId, initial.board.id]);

  const newItem = async () => {
    const group = data.groups[0];
    if (!group) return;
    const item = await actions.createItem({ groupId: group.id, name: t("toolbar.newItem"), top: true, values: valuesFromFilters(data.columns, viewState.filters) });
    if (item) setEditItemId(item.id);
  };

  if (!view) return <div className={styles.message}>{t("common.error")}</div>;
  const openItem = openItemId ? data.items.find((i) => i.id === openItemId) : undefined;

  return (
    <div className={styles.page} data-testid="board-page">
      <div className={styles.main}>
        <div className={styles.top}>
          <BoardHeader board={data} actions={actions} canEditStructure={canEditStructure} />
          <ViewTabs
            views={data.views}
            activeId={view.id}
            onSelect={selectView}
            boardId={data.board.id}
            devBoard={data.board.kind === "dev_sprints" || !!data.board.settings?.dev}
            actions={actions}
            canEditStructure={canEditStructure}
            onCreate={(type, name) => void actions.createView({ name, type }).then((v) => v && selectView(v.id))}
            onDelete={(id) => { void actions.deleteView(id); setViewId(data.views.find((v) => v.id !== id)?.id ?? ""); }}
          />
          <Toolbar
            board={data}
            state={viewState}
            setState={setViewState}
            canEdit={canEdit}
            canEditStructure={canEditStructure}
            onNewItem={() => void newItem()}
            onNewGroup={() => void actions.createGroup({ top: true })}
            onClearAll={clearAll}
            onExport={(format) => void actions.exportBoard({ format })}
            dirty={dirty}
            onSaveAsNew={() => setSaveDialog(true)}
          />
          <SavedViewBar dirty={dirty} canSaveToView={canSaveToView} canShare={canEditStructure} defaultName={view.name === "Main table" ? t("view.mainTable") : view.name} onSaveAsNew={saveAsNew} onSaveToView={saveToView} onDiscard={discard} dialogOpen={saveDialog} onDialogOpenChange={setSaveDialog} />
        </div>
        <ViewRenderer
          board={data}
          view={view}
          viewState={viewState}
          setViewState={setViewState}
          actions={actions}
          onOpenItem={onOpenItem}
          openItemId={openItemId}
          editItemId={editItemId}
          setEditItemId={setEditItemId}
          canEdit={canEdit}
          canEditStructure={canEditStructure}
        />
      </div>
      {openItem ? <ItemPanel key={openItem.id} board={data} item={openItem} actions={actions} onClose={() => onOpenItem(null)} canEdit={canEdit} canComment={data.permissions.comment} onOpenItem={onOpenItem} /> : null}
      {error ? (
        <div className={styles.toast} role="alert" data-testid="board-error">
          {error}
          <button type="button" onClick={clearError} aria-label={t("common.close")}>x</button>
        </div>
      ) : null}
    </div>
  );
}
