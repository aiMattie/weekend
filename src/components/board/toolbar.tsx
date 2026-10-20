"use client";

import { Icon } from "@vibe/core";
import { Add, DropdownChevronDown, DropdownChevronUp, Filter, Group, Hide, Menu as DotsIcon, Person, Search, Sort } from "@vibe/icons";
import { useEffect, useRef, useState } from "react";
import type { SubIcon } from "@vibe/icon";
import { useT } from "@/lib/i18n/client";
import type { BoardFull } from "@/lib/board-types";
import type { ViewState } from "@/lib/view-state";
import { FilterPopover } from "./toolbar/filter-popover";
import { CustomizePopover, GroupByPopover, HidePopover, PersonPopover } from "./toolbar/misc-popovers";
import { useToolbarButtons, type ToolbarButtonId } from "./toolbar/prefs";
import { SortPopover } from "./toolbar/sort-popover";
import { ActionMenu, type MenuEntry } from "./ui/menu";
import styles from "./toolbar.module.css";

interface Props {
  board: BoardFull;
  state: ViewState;
  setState: (p: Partial<ViewState>) => void;
  canEdit: boolean;
  canEditStructure: boolean;
  onNewItem: () => void;
  onNewGroup: () => void;
  onClearAll: () => void;
  /** export the board (or the filtered items) to Excel/CSV; wired by the table */
  onExport?: (format: "xlsx" | "csv") => void;
  /** the view has unsaved changes / open the "Save as new view" dialog (shown in every popover header) */
  dirty?: boolean;
  onSaveAsNew?: () => void;
}

type Which = ToolbarButtonId | "more" | "newmenu" | "customize" | null;

const ICONS: Record<ToolbarButtonId, SubIcon> = { person: Person, filter: Filter, sort: Sort, hide: Hide, groupby: Group };
const LABEL_KEY: Record<ToolbarButtonId, string> = { person: "toolbar.person", filter: "toolbar.filter", sort: "toolbar.sort", hide: "toolbar.hide", groupby: "toolbar.groupBy" };
const TEST_ID: Record<ToolbarButtonId, string> = { person: "toolbar-person", filter: "toolbar-filter", sort: "toolbar-sort", hide: "toolbar-hide", groupby: "toolbar-groupby" };

export function Toolbar({ board, state, setState, canEdit, canEditStructure, onNewItem, onNewGroup, onClearAll, onExport, dirty, onSaveAsNew }: Props) {
  const t = useT();
  const [open, setOpen] = useState<Which>(null);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [searching, setSearching] = useState(false);
  const [draft, setDraft] = useState(state.search);
  const [shown, setShown] = useToolbarButtons();
  const [collapsed, setCollapsed] = useState(false);
  // "New <item noun>": boards may set settings.itemName (e.g. "klant", "fase")
  const noun = typeof board.board.settings.itemName === "string" && board.board.settings.itemName ? board.board.settings.itemName : "item";
  const newLabel = noun === "item" ? t("toolbar.newItem") : `New ${noun}`;
  const moreRef = useRef<HTMLButtonElement>(null);

  // the search box is debounced; an external change (clear all, other view) replaces the draft
  const pushed = useRef(state.search);
  useEffect(() => {
    if (draft === state.search) return;
    const id = setTimeout(() => { pushed.current = draft; setState({ search: draft }); }, 200);
    return () => clearTimeout(id);
  }, [draft, state.search, setState]);
  useEffect(() => {
    if (state.search !== pushed.current) { pushed.current = state.search; setDraft(state.search); }
  }, [state.search]);

  const toggle = (which: Exclude<Which, null>) => (e: React.MouseEvent<HTMLElement>) => {
    if (open === which) return setOpen(null);
    setAnchor(e.currentTarget);
    setOpen(which);
  };
  const close = () => setOpen(null);
  const pop = { anchorEl: anchor, onClose: close, board, state, setState, dirty, onSaveAsNew };
  const counts: Record<ToolbarButtonId, number> = { person: state.personIds.length, filter: state.filters.length, sort: state.sort.length, hide: state.hiddenColumnIds.length, groupby: state.groupByColumnId ? 1 : 0 };

  const btn = (id: ToolbarButtonId) => (
    <button key={id} type="button" className={`${styles.btn} ${counts[id] > 0 || open === id ? styles.btnActive : ""}`} onClick={toggle(id)} data-testid={TEST_ID[id]} aria-expanded={open === id}>
      <Icon icon={ICONS[id]} size={16} ignoreFocusStyle />
      {t(LABEL_KEY[id])}
      {counts[id] > 0 ? <span className={styles.badge} data-testid={`${TEST_ID[id]}-count`}>{counts[id]}</span> : null}
    </button>
  );
  const hasState = !!(state.search || state.personIds.length || state.filters.length || state.sort.length || state.groupByColumnId || state.hiddenColumnIds.length);
  const hiddenButtons = (["person", "filter", "sort", "hide", "groupby"] as const).filter((b) => !shown.includes(b));
  const openFromMore = (id: ToolbarButtonId) => () => { setAnchor(moreRef.current); setTimeout(() => setOpen(id), 0); };
  const moreItems: MenuEntry[] = [
    ...hiddenButtons.map((b) => ({ label: t(LABEL_KEY[b]), icon: <Icon icon={ICONS[b]} size={16} ignoreFocusStyle />, testId: `more-${b}`, onClick: openFromMore(b) })),
    ...(hiddenButtons.length ? [{ divider: true } as MenuEntry] : []),
    { label: t("toolbar.pinColumns"), testId: "toolbar-pin-columns", onClick: () => { setAnchor(moreRef.current); setTimeout(() => setOpen("customize"), 0); } },
    { label: t("toolbar.customize"), testId: "toolbar-customize", onClick: () => { setAnchor(moreRef.current); setTimeout(() => setOpen("customize"), 0); } },
    { label: t("toolbar.clearAll"), disabled: !hasState, testId: "toolbar-clear-all", onClick: onClearAll },
    ...(onExport ? [{ divider: true } as MenuEntry, { label: t("toolbar.exportExcel"), testId: "toolbar-export-xlsx", onClick: () => onExport("xlsx") }, { label: t("toolbar.exportCsv"), testId: "toolbar-export-csv", onClick: () => onExport("csv") }] : []),
  ];

  if (collapsed) {
    return (
      <div className={styles.toolbar} data-testid="toolbar">
        <button type="button" className={styles.collapseBtn} onClick={() => setCollapsed(false)} aria-label={t("toolbar.expand")} data-testid="toolbar-expand"><Icon icon={DropdownChevronDown} size={16} ignoreFocusStyle /></button>
      </div>
    );
  }

  return (
    <div className={styles.toolbar} data-testid="toolbar">
      <span className={styles.newItem}>
        <button type="button" className={styles.newItemMain} onClick={onNewItem} disabled={!canEdit} data-testid="new-item-button">{newLabel}</button>
        <button type="button" className={styles.newItemArrow} onClick={toggle("newmenu")} disabled={!canEdit} aria-label="more" data-testid="new-item-menu">
          <Icon icon={DropdownChevronDown} size={16} ignoreFocusStyle />
        </button>
      </span>
      {open === "newmenu" ? (
        <ActionMenu anchorEl={anchor} onClose={close} items={[
          { label: t("toolbar.newItem"), icon: <Icon icon={Add} size={16} ignoreFocusStyle />, onClick: onNewItem },
          { label: t("toolbar.newGroup"), disabled: !canEditStructure, onClick: onNewGroup, testId: "new-group" },
        ]} />
      ) : null}

      {searching || state.search || draft ? (
        <span className={styles.searchBox}>
          <Icon icon={Search} size={16} ignoreFocusStyle />
          <input
            className={styles.searchInput}
            autoFocus
            placeholder={t("toolbar.searchPlaceholder")}
            value={draft}
            data-testid="toolbar-search-input"
            aria-label={t("toolbar.searchTitle")}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => !draft && setSearching(false)}
            onKeyDown={(e) => { if (e.key === "Escape") { pushed.current = ""; setDraft(""); setState({ search: "" }); setSearching(false); } }}
          />
        </span>
      ) : (
        <button type="button" className={styles.btn} onClick={() => setSearching(true)} data-testid="toolbar-search">
          <Icon icon={Search} size={16} ignoreFocusStyle />
          {t("toolbar.search")}
        </button>
      )}
      {shown.map((id) => btn(id))}
      <button ref={moreRef} type="button" className={styles.btn} onClick={toggle("more")} aria-label={t("toolbar.more")} data-testid="toolbar-more">
        <Icon icon={DotsIcon} size={16} ignoreFocusStyle />
      </button>
      {open === "more" ? <ActionMenu anchorEl={anchor} onClose={close} items={moreItems} /> : null}
      {open === "customize" ? <CustomizePopover {...pop} shown={shown} setShown={setShown} /> : null}
      {open === "person" ? <PersonPopover {...pop} /> : null}
      {open === "filter" ? <FilterPopover {...pop} /> : null}
      {open === "sort" ? <SortPopover {...pop} /> : null}
      {open === "hide" ? <HidePopover {...pop} /> : null}
      {open === "groupby" ? <GroupByPopover {...pop} /> : null}
      <button type="button" className={styles.collapseBtn} onClick={() => { close(); setCollapsed(true); }} aria-label={t("toolbar.collapse")} data-testid="toolbar-collapse"><Icon icon={DropdownChevronUp} size={16} ignoreFocusStyle /></button>
    </div>
  );
}
