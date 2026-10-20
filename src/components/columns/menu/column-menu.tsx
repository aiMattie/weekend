"use client";

import { useRef, useState } from "react";
import { ActionMenu, type MenuEntry } from "@/components/board/ui/menu";
import { api } from "@/lib/api-client";
import type { BoardFull, ColumnDto } from "@/lib/board-types";
import { useT } from "@/lib/i18n/client";
import type { FilterRule, ViewState } from "@/lib/view-state";
import type { BoardActions } from "@/components/board/use-board";
import { ColumnCenter } from "./column-center";
import { ColumnFilterPopover } from "./column-filter";
import { LabelEditor } from "./label-editor";
import { ColumnPermissionsDialog } from "./permissions-dialog";
import { ColumnSettingsDialog } from "./settings-dialog";
import { NO_CONVERT } from "./catalog";
import { AUTOFILL_TYPES, AutofillDialog } from "@/modules/ai/autofill-dialog";

type Dialog = "settings" | "labels" | "type" | "permissions" | "filter" | "autofill" | null;

/**
 * Column header menu: sort, filter, group by, pin, hide, rename, duplicate, change type, settings,
 * edit labels (status/dropdown), permissions, delete. Dialogs mount inside this component.
 */
export function ColumnMenu({ column, board, anchorEl, onClose, actions, viewState, setViewState, canEditStructure, onRename }: {
  column: ColumnDto;
  board: BoardFull;
  anchorEl: HTMLElement | null;
  onClose: () => void;
  actions: BoardActions;
  viewState: ViewState;
  setViewState: (patch: Partial<ViewState>) => void;
  canEditStructure: boolean;
  onRename: () => void;
}) {
  const t = useT();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [menuOpen, setMenuOpen] = useState(true);
  const keep = useRef(false);
  const labelled = column.type === "status" || column.type === "dropdown";
  const pinned = (viewState.pinnedColumnIds ?? []).includes(column.id);
  const grouped = viewState.groupByColumnId === column.id;
  // ActionMenu calls onClose() right before the clicked item's onClick: only tell the parent to unmount us when no dialog was opened
  const close = () => { setMenuOpen(false); queueMicrotask(() => { if (!keep.current) onClose(); }); };
  const openDialog = (d: Dialog) => { keep.current = true; setDialog(d); };
  const closeDialog = () => { setDialog(null); onClose(); };

  const entries: MenuEntry[] = [
    { label: t("table.column.sortAsc"), testId: "column-sort-asc", onClick: () => { setViewState({ sort: [{ columnId: column.id, dir: "asc" }] }); onClose(); } },
    { label: t("table.column.sortDesc"), testId: "column-sort-desc", onClick: () => { setViewState({ sort: [{ columnId: column.id, dir: "desc" }] }); onClose(); } },
    { label: t("col.menu.filter"), testId: "column-filter-open", onClick: () => openDialog("filter") },
    { label: grouped ? t("col.menu.ungroup") : t("col.menu.groupBy"), testId: "column-group-by", onClick: () => { setViewState({ groupByColumnId: grouped ? null : column.id }); onClose(); } },
    { divider: true },
    { label: pinned ? t("col.menu.unpin") : t("col.menu.pin"), testId: "column-pin", onClick: () => { setViewState({ pinnedColumnIds: pinned ? (viewState.pinnedColumnIds ?? []).filter((i) => i !== column.id) : [...(viewState.pinnedColumnIds ?? []), column.id] }); onClose(); } },
    { label: t("table.column.hide"), testId: "column-hide", onClick: () => { setViewState({ hiddenColumnIds: [...viewState.hiddenColumnIds, column.id] }); onClose(); } },
    { divider: true },
    { label: t("table.column.rename"), disabled: !canEditStructure, testId: "column-rename", onClick: () => { onRename(); onClose(); } },
    { label: t("table.column.duplicate"), disabled: !canEditStructure, testId: "column-duplicate", onClick: () => { void actions.duplicateColumn(column.id); onClose(); } },
    { label: t("col.menu.changeType"), disabled: !canEditStructure || NO_CONVERT.has(column.type), testId: "column-change-type", onClick: () => openDialog("type") },
    ...(labelled ? [{ label: t("col.menu.editLabels"), disabled: !canEditStructure, testId: "column-edit-labels", onClick: () => openDialog("labels") }] : []),
    { label: t("col.menu.settings"), disabled: !canEditStructure, testId: "column-settings-open", onClick: () => openDialog("settings") },
    { label: t("col.menu.permissions"), disabled: !canEditStructure, testId: "column-permissions-open", onClick: () => openDialog("permissions") },
    ...(AUTOFILL_TYPES.has(column.type) ? [{ label: t("ai.fill.menu"), disabled: !canEditStructure, testId: "column-ai-autofill", onClick: () => openDialog("autofill") }] : []),
    { divider: true },
    { label: t("table.column.delete"), danger: true, disabled: !canEditStructure, testId: "column-delete", onClick: () => { void actions.deleteColumn(column.id); onClose(); } },
  ];

  return (
    <>
      {menuOpen && !dialog ? <ActionMenu anchorEl={anchorEl} onClose={close} items={entries} /> : null}
      {dialog === "filter" ? (
        <ColumnFilterPopover anchorEl={anchorEl} column={column} board={board} rules={viewState.filters} onApply={(filters: FilterRule[]) => setViewState({ filters })} onClose={closeDialog} />
      ) : null}
      {dialog === "settings" ? (
        <ColumnSettingsDialog column={column} board={board} onClose={closeDialog} onSave={(p) => void actions.updateColumn(column.id, p as never)} />
      ) : null}
      {dialog === "labels" ? (
        <LabelEditor column={column} onClose={closeDialog} onSave={(labels) => void actions.updateColumn(column.id, { settings: { labels } })} />
      ) : null}
      {dialog === "autofill" ? <AutofillDialog column={column} board={board} onClose={closeDialog} onDone={() => void actions.refetch()} /> : null}
      {dialog === "permissions" ? <ColumnPermissionsDialog column={column} board={board} onClose={closeDialog} /> : null}
      {dialog === "type" ? (
        <ColumnCenter board={board} mode="change" currentType={column.type} onClose={closeDialog}
          onPick={(r) => void api.post(`/api/v1/columns/${column.id}/type`, { type: r.type }).then(() => actions.refetch())} />
      ) : null}
    </>
  );
}
