"use client";

import { Icon } from "@vibe/core";
import { Close, DropdownChevronDown, DropdownChevronUp, Menu as DotsIcon } from "@vibe/icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { InlineText } from "@/components/board/ui/inline-text";
import { ActionMenu, type MenuEntry } from "@/components/board/ui/menu";
import type { BoardActions } from "@/components/board/use-board";
import { useBoardEvents } from "@/components/board/use-board-events";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import type { BoardFull, ItemDto } from "@/lib/board-types";
import { ItemDetails } from "./item-details";
import { Picker, type PickerEntry } from "./item-picker";
import { PANEL_TABS } from "./tabs";
import { SubitemsSection } from "./subitems-section";
import styles from "./item-panel.module.css";

interface Props {
  board: BoardFull;
  item: ItemDto;
  actions: BoardActions;
  onClose: () => void;
  canEdit: boolean;
  canComment: boolean;
  onOpenItem: (id: string | null) => void;
}

const WIDTH_KEY = "weekend:panel-width";
const MIN_W = 380;
const readWidth = (): number => {
  try { const n = Number(localStorage.getItem(WIDTH_KEY)); return n >= MIN_W ? n : 560; } catch { return 560; }
};

export const itemLink = (boardId: string, itemId: string) => `${window.location.origin}/boards/${boardId}/pulses/${itemId}`;

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } finally { ta.remove(); }
  }
}

/** Right-hand item panel (URL ?item=<id> or /boards/<id>/pulses/<id> is the source of truth). */
export function ItemPanel({ board, item, actions, onClose, canEdit, canComment, onOpenItem }: Props) {
  const t = useT();
  const [tab, setTab] = useState(PANEL_TABS[0].id);
  const [tick, setTick] = useState(0);
  const [width, setWidth] = useState(560); // stored width is applied after hydration (localStorage is client only)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setWidth(readWidth()); }, []);
  const [menuEl, setMenuEl] = useState<HTMLElement | null>(null);
  const [picker, setPicker] = useState<"board" | "parent" | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [boards, setBoards] = useState<PickerEntry[]>([]);
  const [menuBtn, setMenuBtn] = useState<HTMLButtonElement | null>(null);
  // keep updates/activity fresh when somebody else posts
  useBoardEvents(board.board.id, () => setTick((n) => n + 1));
  const tabs = PANEL_TABS.filter((x) => !x.visible || x.visible(board));
  const active = tabs.find((x) => x.id === tab) ?? tabs[0];
  const Active = active.Component;
  const parent = item.parentItemId ? board.items.find((i) => i.id === item.parentItemId) : null;

  // prev/next among siblings, in display order (groups first, then position)
  const siblings = useMemo(() => {
    const gpos = new Map(board.groups.map((g) => [g.id, g.position]));
    return board.items
      .filter((i) => i.parentItemId === item.parentItemId && (item.parentItemId || !!i.groupId))
      .sort((a, b) => (gpos.get(a.groupId ?? "") ?? 0) - (gpos.get(b.groupId ?? "") ?? 0) || a.position - b.position);
  }, [board.items, board.groups, item.parentItemId]);
  const idx = siblings.findIndex((i) => i.id === item.id);
  const prev = idx > 0 ? siblings[idx - 1] : null;
  const next = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2500); };

  const startResize = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    let last = startW;
    const move = (ev: PointerEvent) => {
      last = Math.min(Math.max(MIN_W, startW + (startX - ev.clientX)), Math.round(window.innerWidth * 0.9));
      setWidth(last);
    };
    const up = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      try { localStorage.setItem(WIDTH_KEY, String(last)); } catch { /* storage unavailable */ }
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  }, [width]);

  const openBoardPicker = async () => {
    try {
      const all = await api.get<{ id: string; name: string; kind: string }[]>("/api/v1/boards");
      setBoards(all.filter((b) => b.id !== board.board.id && b.kind === "board").map((b) => ({ id: b.id, label: b.name })));
    } catch { setBoards([]); }
    setPicker("board");
  };

  const parentEntries: PickerEntry[] = board.items
    .filter((i) => !i.parentItemId && i.id !== item.id)
    .map((i) => ({ id: i.id, label: i.name, sub: board.groups.find((g) => g.id === i.groupId)?.title }));

  const run = (fn: () => Promise<unknown>) => void fn().catch((e) => flash(e instanceof Error ? e.message : t("common.error")));

  const groupMoves: MenuEntry[] = parent ? [] : board.groups.filter((g) => g.id !== item.groupId).map((g) => ({
    key: `grp-${g.id}`, label: g.title, disabled: !canEdit, testId: "panel-move-group", onClick: () => void actions.moveItem(item.id, { groupId: g.id }),
  }));

  const entries: MenuEntry[] = [
    { label: t("panel.copyLink"), testId: "panel-copy-link", onClick: () => run(async () => { await copyText(itemLink(board.board.id, item.id)); flash(t("panel.linkCopied")); }) },
    { label: t("table.item.duplicate"), disabled: !canEdit, testId: "panel-duplicate", onClick: () => run(() => actions.duplicateItem(item.id).then(() => flash(t("panel.duplicated")))) },
    ...(parent
      ? [{ label: t("panel.convertToItem"), disabled: !canEdit, testId: "panel-convert-item", onClick: () => run(() => api.post(`/api/v1/items/${item.id}/convert`, { to: "item" }).then(() => flash(t("panel.converted")))) }]
      : [{ label: t("panel.convertToSubitem"), disabled: !canEdit || item.subitemCount > 0, testId: "panel-convert-subitem", onClick: () => setTimeout(() => setPicker("parent"), 0) }]),
    ...(parent ? [] : [{ label: t("panel.moveToBoard"), disabled: !canEdit, testId: "panel-move-board", onClick: () => void openBoardPicker() }]),
    ...(groupMoves.length ? [{ title: t("panel.moveToGroup") }, ...groupMoves] : []),
    { divider: true },
    { label: t("table.item.archive"), disabled: !canEdit, testId: "panel-archive", onClick: () => { onClose(); void actions.archiveItem(item.id); } },
    { label: t("table.item.delete"), danger: true, disabled: !canEdit, testId: "panel-delete", onClick: () => { if (window.confirm(t("panel.deleteItemConfirm"))) { onClose(); void actions.deleteItem(item.id); } } },
  ];

  return (
    <aside className={styles.panel} style={{ width }} data-testid="item-panel" data-item-id={item.id}>
      <div className={styles.resizer} onPointerDown={startResize} data-testid="panel-resize" role="separator" aria-orientation="vertical" aria-label={t("panel.resize")} />
      <div className={styles.head}>
        <div className={styles.headTop}>
          <button type="button" className={styles.iconBtn} onClick={onClose} aria-label={t("panel.close")} data-testid="panel-close"><Icon icon={Close} size={20} ignoreFocusStyle /></button>
          <span className={styles.spacer} />
          <button type="button" className={styles.iconBtn} disabled={!prev} onClick={() => prev && onOpenItem(prev.id)} aria-label={t("panel.prev")} title={t("panel.prev")} data-testid="panel-prev"><Icon icon={DropdownChevronUp} size={20} ignoreFocusStyle /></button>
          <button type="button" className={styles.iconBtn} disabled={!next} onClick={() => next && onOpenItem(next.id)} aria-label={t("panel.next")} title={t("panel.next")} data-testid="panel-next"><Icon icon={DropdownChevronDown} size={20} ignoreFocusStyle /></button>
          <button ref={setMenuBtn} type="button" className={styles.iconBtn} onClick={(e) => setMenuEl(menuEl ? null : e.currentTarget)} aria-label={t("panel.actions")} title={t("panel.actions")} data-testid="panel-menu"><Icon icon={DotsIcon} size={20} ignoreFocusStyle /></button>
        </div>
        {parent ? <button type="button" className={styles.linkBtn} onClick={() => onOpenItem(parent.id)} data-testid="panel-parent">{parent.name} /</button> : null}
        <h2 className={styles.name} data-testid="panel-title">
          <InlineText value={item.name} disabled={!canEdit} testId="panel-title-text" onCommit={(v) => void actions.renameItem(item.id, v)} />
        </h2>
        <div className={styles.tabs} role="tablist">
          {tabs.map((x) => (
            <button key={x.id} type="button" role="tab" aria-selected={x.id === tab} className={`${styles.tabBtn} ${x.id === tab ? styles.tabOn : ""}`} onClick={() => setTab(x.id)} data-testid={`tab-${x.id}`}>
              {t(x.labelKey)}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.scroll}>
        <ItemDetails board={board} item={item} canEdit={canEdit} actions={actions} />
        {tab === "updates" && !item.parentItemId ? <SubitemsSection board={board} item={item} actions={actions} canEdit={canEdit} onOpenItem={onOpenItem} /> : null}
        <Active key={`${active.id}-${item.id}`} refreshKey={tick} board={board} item={item} canEdit={canEdit} canComment={canComment} />
      </div>
      {menuEl ? <ActionMenu anchorEl={menuEl} align="end" onClose={() => setMenuEl(null)} items={entries} /> : null}
      {picker === "parent" ? (
        <Picker anchorEl={menuBtn} title={t("panel.pickParent")} entries={parentEntries} testId="picker-parent" onClose={() => setPicker(null)}
          onPick={(id) => run(() => api.post(`/api/v1/items/${item.id}/convert`, { to: "subitem", parentItemId: id }).then(() => flash(t("panel.converted"))))} />
      ) : null}
      {picker === "board" ? (
        <Picker anchorEl={menuBtn} title={t("panel.pickBoard")} entries={boards} testId="picker-board" onClose={() => setPicker(null)}
          onPick={(id) => run(async () => { await api.post(`/api/v1/items/${item.id}/move`, { boardId: id }); onClose(); void actions.refetch(); })} />
      ) : null}
      {toast ? <div className={styles.toast} role="status" data-testid="panel-toast">{toast}</div> : null}
    </aside>
  );
}
