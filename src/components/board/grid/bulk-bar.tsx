"use client";

import { Icon } from "@vibe/core";
import { Archive, Close, Delete, Download, Duplicate, Edit, Move } from "@vibe/icons";
import { createPortal } from "react-dom";
import { useState } from "react";
import { useIsClient } from "@/lib/use-persistent-state";
import { useT } from "@/lib/i18n/client";
import type { ItemDto } from "@/lib/board-types";
import { useTable } from "../table/table-context";
import { ActionMenu } from "../ui/menu";
import { ParentPicker } from "./parent-picker";
import { MoveToPicker, UpdateColumnPicker } from "./bulk-pickers";
import styles from "./grid.module.css";

type Which = "export" | "move" | "update" | "convert" | null;

/** action bar that appears at the bottom when items are selected. */
export function BulkBar({ selected, rowOrder, itemsById, onClear }: { selected: Set<string>; rowOrder: string[]; itemsById: Map<string, ItemDto>; onClear: () => void }) {
  const t = useT();
  const mounted = useIsClient();
  const { actions, board, canEdit } = useTable();
  const [open, setOpen] = useState<Which>(null);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const ids = rowOrder.filter((id) => selected.has(id));
  if (!mounted || ids.length === 0) return null;
  const count = ids.length;
  const single = count === 1 ? itemsById.get(ids[0]) : undefined;

  const toggle = (w: Exclude<Which, null>) => (e: React.MouseEvent<HTMLElement>) => {
    setAnchor(e.currentTarget);
    setOpen((cur) => (cur === w ? null : w));
  };
  const close = () => setOpen(null);
  const done = () => onClear();
  const btn = (id: string, label: string, icon: Parameters<typeof Icon>[0]["icon"], onClick: (e: React.MouseEvent<HTMLElement>) => void, disabled = false) => (
    <button type="button" className={styles.bulkBtn} onClick={onClick} disabled={disabled} data-testid={id}>
      <Icon icon={icon} size={20} ignoreFocusStyle />
      <span>{label}</span>
    </button>
  );

  return createPortal(
    <div className={styles.bulkBar} data-testid="bulk-bar" role="toolbar">
      <div className={styles.bulkCount} data-testid="bulk-count"><span className={styles.bulkBadge}>{count}</span> {count === 1 ? t("bulk.itemSelected") : t("bulk.itemsSelected")}</div>
      <div className={styles.bulkActions}>
        {btn("bulk-duplicate", t("common.duplicate"), Duplicate, () => { void actions.bulk({ action: "duplicate", itemIds: ids }); done(); }, !canEdit)}
        {btn("bulk-export", t("bulk.export"), Download, toggle("export"))}
        {btn("bulk-archive", t("common.archive"), Archive, () => { void actions.bulk({ action: "archive", itemIds: ids }); done(); }, !canEdit)}
        {btn("bulk-delete", t("common.delete"), Delete, () => { void actions.bulk({ action: "delete", itemIds: ids }); done(); }, !canEdit)}
        {btn("bulk-move", t("bulk.moveTo"), Move, toggle("move"), !canEdit)}
        {btn("bulk-update", t("bulk.updateColumn"), Edit, toggle("update"), !canEdit)}
        {single && !single.parentItemId && single.subitemCount === 0 ? btn("bulk-convert", t("bulk.convertToSubitem"), Move, toggle("convert"), !canEdit) : null}
      </div>
      <button type="button" className={styles.bulkClose} onClick={onClear} aria-label={t("bulk.clear")} data-testid="bulk-clear"><Icon icon={Close} size={20} ignoreFocusStyle /></button>
      {open === "export" ? (
        <ActionMenu anchorEl={anchor} onClose={close} items={[
          { label: t("bulk.exportXlsx"), testId: "bulk-export-xlsx", onClick: () => void actions.exportBoard({ format: "xlsx", itemIds: ids }) },
          { label: t("bulk.exportCsv"), testId: "bulk-export-csv", onClick: () => void actions.exportBoard({ format: "csv", itemIds: ids }) },
        ]} />
      ) : null}
      {open === "move" ? <MoveToPicker board={board} anchorEl={anchor} onClose={close} onMove={(to) => { void actions.bulk({ action: "move", itemIds: ids, ...to }); done(); }} /> : null}
      {open === "update" ? <UpdateColumnPicker board={board} anchorEl={anchor} onClose={close} onApply={(columnId, value) => { void actions.bulk({ action: "update", itemIds: ids, columnId, value }); done(); }} /> : null}
      {open === "convert" && single ? <ParentPicker board={board} anchorEl={anchor} exclude={[single.id]} onClose={close} onPick={(pid) => { void actions.convertItem(single.id, { to: "subitem", parentItemId: pid }); done(); }} /> : null}
    </div>,
    document.body,
  );
}
