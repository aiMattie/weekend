"use client";

import { Icon } from "@vibe/core";
import { Add, Archive, Check, Collapse, Delete, Download, Duplicate, Edit, Expand, MoveArrowDown, MoveArrowUp } from "@vibe/icons";
import type { SubIcon } from "@vibe/icon";
import { useState } from "react";
import { WEEKEND_COLORS } from "@/lib/colors";
import { useT } from "@/lib/i18n/client";
import type { GroupDto } from "@/lib/board-types";
import type { RenderGroup } from "@/lib/view-state";
import { ActionMenu, type MenuEntry } from "../ui/menu";
import { Popover } from "../ui/popover";
import { useTable } from "./table-context";

interface Props {
  group: GroupDto;
  allGroups: RenderGroup[];
  itemIds: string[];
  anchorEl: HTMLElement;
  onClose: () => void;
  onRename: () => void;
  onSetAllCollapsed: (all: boolean) => void;
}

/** The "..." menu of a group header (rename, color, collapse, duplicate, move, add, export, delete). */
export function GroupMenu({ group, allGroups, itemIds, anchorEl, onClose, onRename, onSetAllCollapsed }: Props) {
  const t = useT();
  const { actions, canEditStructure, setSelection } = useTable();
  const [colorOpen, setColorOpen] = useState(false);
  const real = allGroups.filter((g) => !g.virtual).map((g) => g.group);
  const idx = real.findIndex((g) => g.id === group.id);
  const icon = (i: SubIcon) => <Icon icon={i} size={16} ignoreFocusStyle />;
  const s = canEditStructure;

  if (colorOpen) {
    return (
      <Popover anchorEl={anchorEl} onClose={onClose}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 28px)", gap: 8, padding: 12 }} data-testid="group-colors">
          {WEEKEND_COLORS.map((c) => (
            <button key={c.hex} type="button" aria-label={c.name} data-testid={`group-color-${c.hex.slice(1)}`} onClick={() => { onClose(); void actions.updateGroup(group.id, { color: c.hex }); }} style={{ width: 28, height: 28, borderRadius: "50%", border: group.color === c.hex ? "2px solid #323338" : 0, background: c.hex, cursor: "pointer" }} />
          ))}
        </div>
      </Popover>
    );
  }

  const items: MenuEntry[] = [
    { label: t("table.group.collapseAll"), icon: icon(Collapse), onClick: () => onSetAllCollapsed(true), testId: "group-collapse-all" },
    { label: t("grid.group.expandAll"), icon: icon(Expand), onClick: () => onSetAllCollapsed(false) },
    { label: t("grid.group.selectAll"), icon: icon(Check), onClick: () => setSelection(itemIds, true), testId: "group-select-all" },
    { divider: true },
    { label: t("table.group.rename"), icon: icon(Edit), disabled: !s, onClick: onRename, testId: "group-rename" },
    { label: t("table.group.color"), icon: icon(Edit), disabled: !s, onClick: () => setColorOpen(true), testId: "group-color" },
    { label: t("table.group.duplicate"), icon: icon(Duplicate), disabled: !s, onClick: () => void actions.duplicateGroup(group.id), testId: "group-duplicate" },
    { label: t("grid.group.addAbove"), icon: icon(Add), disabled: !s, onClick: () => void actions.createGroup({ beforeId: group.id }), testId: "group-add-above" },
    { label: t("grid.group.addBelow"), icon: icon(Add), disabled: !s, onClick: () => void actions.createGroup({ afterId: group.id }), testId: "group-add-below" },
    { divider: true },
    { label: t("grid.group.moveTop"), icon: icon(MoveArrowUp), disabled: !s || idx <= 0, onClick: () => void actions.moveGroup(group.id, { top: true }) },
    { label: t("grid.group.moveUp"), icon: icon(MoveArrowUp), disabled: !s || idx <= 0, onClick: () => void actions.moveGroup(group.id, { beforeId: real[idx - 1].id }), testId: "group-move-up" },
    { label: t("grid.group.moveDown"), icon: icon(MoveArrowDown), disabled: !s || idx < 0 || idx >= real.length - 1, onClick: () => void actions.moveGroup(group.id, { afterId: real[idx + 1].id }), testId: "group-move-down" },
    { label: t("grid.group.moveBottom"), icon: icon(MoveArrowDown), disabled: !s || idx < 0 || idx >= real.length - 1, onClick: () => void actions.moveGroup(group.id, { afterId: real[real.length - 1].id }) },
    { divider: true },
    { label: t("grid.group.exportXlsx"), icon: icon(Download), onClick: () => void actions.exportBoard({ format: "xlsx", groupId: group.id }), testId: "group-export-xlsx" },
    { label: t("grid.group.exportCsv"), icon: icon(Download), onClick: () => void actions.exportBoard({ format: "csv", groupId: group.id }), testId: "group-export-csv" },
    { divider: true },
    { label: t("grid.group.archive"), icon: icon(Archive), disabled: !s || real.length <= 1, onClick: () => void actions.archiveGroup(group.id), testId: "group-archive" },
    { label: t("table.group.delete"), icon: icon(Delete), danger: true, disabled: !s || real.length <= 1, testId: "group-delete", onClick: () => { if (window.confirm(t("table.deleteGroupConfirm"))) void actions.deleteGroup(group.id); } },
  ];
  return <ActionMenu anchorEl={anchorEl} onClose={onClose} items={items} />;
}
