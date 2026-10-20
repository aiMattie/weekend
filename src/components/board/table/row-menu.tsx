"use client";

/* eslint-disable react-hooks/refs -- dnd-kit hands out callback refs and listeners; the lint rule mistakes them for ref objects */

import { Icon } from "@vibe/core";
import { Archive, Delete, Drag, Duplicate, Link, Move, Open } from "@vibe/icons";
import type { SubIcon } from "@vibe/icon";
import { useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";
import type { ItemDto } from "@/lib/board-types";
import { ParentPicker } from "../grid/parent-picker";
import { ActionMenu, type MenuEntry } from "../ui/menu";
import { useTable } from "./table-context";

/** Row "..." menu of an item or subitem. */
export function RowMenu({ item, anchorEl, onClose }: { item: ItemDto; anchorEl: HTMLElement; onClose: () => void }) {
  const t = useT();
  const { actions, board, canEdit, onOpenItem, subitemsOf } = useTable();
  const [pickParent, setPickParent] = useState(false);
  const keep = useRef(false);
  const isSub = !!item.parentItemId;
  const icon = (i: SubIcon) => <Icon icon={i} size={16} ignoreFocusStyle />;

  if (pickParent) {
    return <ParentPicker board={board} anchorEl={anchorEl} exclude={[item.id]} onClose={onClose} onPick={(pid) => void actions.convertItem(item.id, { to: "subitem", parentItemId: pid })} />;
  }
  const link = () => {
    const url = `${window.location.origin}/boards/${item.boardId}/pulses/${item.id}`;
    void navigator.clipboard?.writeText(url).catch(() => undefined);
  };
  const entries: MenuEntry[] = [
    { label: t("table.item.open"), icon: icon(Open), onClick: () => onOpenItem(item.id), testId: "row-open" },
    { label: t("grid.row.copyLink"), icon: icon(Link), onClick: link, testId: "row-copy-link" },
    { label: t("table.item.duplicate"), icon: icon(Duplicate), disabled: !canEdit, onClick: () => void actions.duplicateItem(item.id), testId: "row-duplicate" },
  ];
  if (!isSub) {
    const groups = board.groups.filter((g) => g.id !== item.groupId);
    if (groups.length) entries.push({ title: t("grid.row.moveTo") }, ...groups.map((g) => ({ key: `mv-${g.id}`, label: g.title, icon: icon(Move), disabled: !canEdit, testId: `row-move-${g.id}`, onClick: () => void actions.moveItem(item.id, { groupId: g.id }) })));
    if (subitemsOf(item.id).length === 0) entries.push({ label: t("grid.row.convertToSubitem"), icon: icon(Drag), disabled: !canEdit, onClick: () => { keep.current = true; setPickParent(true); }, testId: "row-convert-subitem" });
  } else entries.push({ label: t("grid.row.convertToItem"), icon: icon(Drag), disabled: !canEdit, onClick: () => void actions.convertItem(item.id, { to: "item" }), testId: "row-convert-item" });
  entries.push(
    { divider: true },
    { label: t("table.item.archive"), icon: icon(Archive), disabled: !canEdit, onClick: () => void actions.archiveItem(item.id), testId: "row-archive" },
    { label: t("table.item.delete"), icon: icon(Delete), danger: true, disabled: !canEdit, onClick: () => void actions.deleteItem(item.id), testId: "row-delete" },
  );
  // ActionMenu calls onClose before onClick: defer so "convert to subitem" can keep this component mounted for its picker
  return <ActionMenu anchorEl={anchorEl} onClose={() => setTimeout(() => { if (!keep.current) onClose(); }, 0)} items={entries} />;
}
