"use client";

import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Icon } from "@vibe/core";
import { Add, MoreActions, Person } from "@vibe/icons";
import { useMemo, useState } from "react";
import { ActionMenu, type MenuEntry } from "@/components/board/ui/menu";
import type { BoardActions } from "@/components/board/use-board";
import { api } from "@/lib/api-client";
import type { ViewDto } from "@/lib/board-types";
import { useT } from "@/lib/i18n/client";
import { AddViewPicker } from "./add-view-picker";
import { ViewTypeIcon } from "./view-icons";
import styles from "./manage.module.css";

interface Props {
  views: ViewDto[];
  activeId: string;
  onSelect: (id: string) => void;
  canEditStructure: boolean;
  onCreate: (type: string, name: string) => void;
  onDelete: (id: string) => void;
  boardId?: string;
  /** Weekend dev views are only offered on sprint boards and on the boards wired into a dev workspace */
  devBoard?: boolean;
  actions?: Pick<BoardActions, "refetch" | "updateView">;
}

/** Share link of a view: the board URL with `?view=<id>`. */
export const viewLink = (boardId: string, viewId: string): string => `${typeof window === "undefined" ? "" : window.location.origin}/boards/${boardId}?view=${viewId}`;

export function ViewTabs({ views, activeId, onSelect, canEditStructure, onCreate, onDelete, boardId, devBoard, actions }: Props) {
  const t = useT();
  const [plusEl, setPlusEl] = useState<HTMLElement | null>(null);
  const [menu, setMenu] = useState<{ el: HTMLElement; id: string } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [order, setOrder] = useState<{ ids: string[]; base: string } | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // a fresh server order replaces the optimistic one
  const serverOrder = views.map((v) => v.id).join(",");
  const shown = useMemo(() => (order && order.base === serverOrder ? order.ids.map((id) => views.find((v) => v.id === id)).filter((v): v is ViewDto => !!v) : views), [order, serverOrder, views]);
  const tabLabel = (v: ViewDto) => (v.name === "Main table" ? t("view.mainTable") : v.name);

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2200); };
  const copyLink = async (id: string) => {
    if (!boardId) return;
    const url = viewLink(boardId, id);
    try { await navigator.clipboard.writeText(url); } catch { /* clipboard blocked: the toast still shows the link */ }
    flash(`${t("vw.linkCopied")}: ${url}`);
  };
  const duplicate = async (id: string) => {
    const copy = await api.post<ViewDto>(`/api/v1/views/${id}/duplicate`, {});
    await actions?.refetch();
    if (copy) onSelect(copy.id);
  };
  const makeDefault = async (id: string) => { await api.post(`/api/v1/views/${id}/default`, {}); await actions?.refetch(); };
  const reorder = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const ids = shown.map((v) => v.id);
    const from = ids.indexOf(String(e.active.id));
    const to = ids.indexOf(String(e.over.id));
    const next = arrayMove(ids, from, to);
    setOrder({ ids: next, base: serverOrder });
    const pos = next.indexOf(String(e.active.id));
    const spec = pos === 0 ? { top: true } : { afterId: next[pos - 1] };
    void api.patch(`/api/v1/views/${e.active.id}`, spec).then(() => actions?.refetch());
  };

  const shareWithBoard = async (id: string) => { await api.post(`/api/v1/views/${id}/share`, { shared: true }); await actions?.refetch(); };
  const menuItems = (id: string): MenuEntry[] => [
    ...(views.find((v) => v.id === id)?.ownerId && canEditStructure ? [{ label: t("vw.shareWithBoard"), testId: "view-menu-share-toggle", onClick: () => void shareWithBoard(id) }] : []),
    { label: t("common.rename"), testId: "view-menu-rename", onClick: () => setRenaming(id) },
    { label: t("common.duplicate"), testId: "view-menu-duplicate", onClick: () => void duplicate(id) },
    { label: t("vw.shareLink"), testId: "view-menu-share", onClick: () => void copyLink(id) },
    { label: t("vw.makeDefault"), testId: "view-menu-default", disabled: views[0]?.id === id, onClick: () => void makeDefault(id) },
    { divider: true },
    { label: t("common.delete"), danger: true, testId: "view-menu-delete", disabled: views.length < 2, onClick: () => onDelete(id) },
  ];

  return (
    <div className={styles.tabs} role="tablist" data-testid="view-tabs">
      <DndContext id="view-tabs-dnd" sensors={sensors} collisionDetection={closestCenter} onDragEnd={reorder}>
        <SortableContext items={shown.map((v) => v.id)} strategy={horizontalListSortingStrategy} disabled={!canEditStructure}>
          {shown.map((v) => (
            <Tab key={v.id} view={v} active={v.id === activeId} isDefault={views[0]?.id === v.id && views.length > 1} label={tabLabel(v)} renaming={renaming === v.id} canEdit={canEditStructure}
              onSelect={() => onSelect(v.id)} onMenu={(el) => setMenu(menu?.id === v.id ? null : { el, id: v.id })} onStartRename={() => setRenaming(v.id)}
              onRename={(name) => { setRenaming(null); if (name && name !== v.name) void actions?.updateView(v.id, { name }); }} />
          ))}
        </SortableContext>
      </DndContext>
      {canEditStructure ? (
        <button type="button" className={styles.tabPlus} onClick={(e) => setPlusEl(plusEl ? null : e.currentTarget)} aria-label={t("board.addView")} data-testid="add-view">
          <Icon icon={Add} size={16} ignoreFocusStyle />
        </button>
      ) : null}
      {plusEl ? <AddViewPicker devBoard={devBoard} anchorEl={plusEl} onClose={() => setPlusEl(null)} onPick={onCreate} /> : null}
      {menu ? <ActionMenu anchorEl={menu.el} onClose={() => setMenu(null)} items={menuItems(menu.id)} /> : null}
      {toast ? <div className={styles.copied} role="status" data-testid="view-toast">{toast}</div> : null}
    </div>
  );
}

interface TabProps { view: ViewDto; active: boolean; isDefault: boolean; label: string; renaming: boolean; canEdit: boolean; onSelect: () => void; onMenu: (el: HTMLElement) => void; onStartRename: () => void; onRename: (name: string) => void }

function Tab({ view, active, isDefault, label, renaming, canEdit, onSelect, onMenu, onStartRename, onRename }: TabProps) {
  const t = useT();
  const { attributes: sortAttrs, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: view.id, disabled: !canEdit || renaming });
  // aria-disabled on the tab would make the rename input count as disabled for assistive tech and tests
  const { "aria-disabled": _ariaDisabled, ...attributes } = sortAttrs;
  void _ariaDisabled;
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} {...attributes} {...listeners}
      className={`${styles.tab} ${active ? styles.tabActive : ""} ${isDragging ? styles.tabDragging : ""}`} role="tab" aria-selected={active}
      data-testid="view-tab" data-view-id={view.id} data-view-type={view.type} data-view-name={view.name} data-view-personal={view.ownerId ? "true" : undefined}
      onClick={onSelect} onDoubleClick={() => canEdit && onStartRename()}>
      <ViewTypeIcon type={view.type} size={16} />
      {view.ownerId ? <span className={styles.defaultDot} title={t("vw.personal")} data-testid="view-personal-icon"><Icon icon={Person} size={12} ignoreFocusStyle /></span> : null}
      {renaming ? (
        <RenameInput initial={view.name} onDone={onRename} />
      ) : (
        <span data-testid="view-tab-name">{label}</span>
      )}
      {isDefault ? <span className={styles.defaultDot} title={t("vw.default")}>•</span> : null}
      {active && canEdit && !renaming ? (
        <button type="button" className={styles.tabMenu} aria-label="view menu" data-testid="view-menu" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onMenu(e.currentTarget); }}>
          <Icon icon={MoreActions} size={14} ignoreFocusStyle />
        </button>
      ) : null}
    </div>
  );
}

function RenameInput({ initial, onDone }: { initial: string; onDone: (name: string) => void }) {
  const [draft, setDraft] = useState(initial);
  return (
    <input ref={(el) => el?.select()} className={styles.renameInput} value={draft} autoFocus data-testid="view-rename-input" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") onDone(draft.trim()); if (e.key === "Escape") onDone(initial); }} onChange={(e) => setDraft(e.target.value)} onBlur={() => onDone(draft.trim())} />
  );
}
