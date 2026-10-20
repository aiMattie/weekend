"use client";

import { Icon } from "@vibe/core";
import { Connect } from "@vibe/icons";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Popover } from "@/components/board/ui/popover";
import { useT } from "@/lib/i18n/client";
import type { LinkedItemRef, RelationValue } from "@/server/columns/relation-base";
import { relationIds } from "@/server/columns/relation-base";
import { ItemPicker } from "./item-picker";
import { rememberItem, rememberedItem } from "./lookups";
import type { ColumnUi, EditorProps } from "./types";
import pack from "./pack.module.css";
import styles from "./cells.module.css";

function refsOf(v: RelationValue | null): LinkedItemRef[] {
  for (const i of v?.items ?? []) rememberItem(i.id, i.name, i.boardId);
  return relationIds(v).map((id) => {
    const d = v?.items?.find((i) => i.id === id);
    const r = rememberedItem(id);
    return { id, name: d?.name ?? r?.name ?? "...", boardId: d?.boardId ?? r?.boardId ?? "" };
  });
}

function RelationCell({ value, testId }: { value: RelationValue | null; testId: string }) {
  const router = useRouter();
  const refs = refsOf(value);
  return (
    <div className={styles.cell}>
      <div className={pack.chips} data-testid={testId}>
        {refs.slice(0, 3).map((r) => (
          <button key={r.id} type="button" className={`${pack.chip} ${pack.chipLink}`} data-testid="relation-chip" title={r.name}
            onClick={(e) => { e.stopPropagation(); if (r.boardId) router.push(`/boards/${r.boardId}?item=${r.id}`); }}>
            {r.name}
          </button>
        ))}
        {refs.length > 3 ? <span className={pack.more}>+{refs.length - 3}</span> : null}
        {!refs.length ? <span className={styles.emptyPerson}><Icon icon={Connect} size={18} ignoreFocusStyle /></span> : null}
      </div>
    </div>
  );
}

function RelationEditor({ column, item, value, onCommit, onCancel, anchorEl, board }: EditorProps<RelationValue>) {
  const t = useT();
  const isDep = column.type === "dependency";
  const boardIds = isDep ? [board.board.id] : ((column.settings.boardIds as string[] | undefined) ?? []);
  if (!boardIds.length) {
    return <PopMessage anchorEl={anchorEl} onClose={onCancel}>{t("col.relation.notConnected")}</PopMessage>;
  }
  return (
    <ItemPicker
      anchorEl={anchorEl}
      boardIds={boardIds}
      selectedIds={relationIds(value)}
      allowMultiple={column.settings.allowMultiple !== false}
      excludeItemId={isDep ? item.id : undefined}
      onChange={(ids, keepOpen) => onCommit(ids.length ? { item_ids: ids } : null, { keepOpen })}
      onClose={onCancel}
    />
  );
}

function PopMessage({ anchorEl, onClose, children }: { anchorEl: HTMLElement | null; onClose: () => void; children: ReactNode }) {
  return <Popover anchorEl={anchorEl} onClose={onClose}><div className={styles.popPanel}>{children}</div></Popover>;
}

export const boardRelationUi: ColumnUi<RelationValue> = {
  align: "left",
  defaultWidth: 200,
  Cell: ({ value }) => <RelationCell value={value} testId="relation-cell" />,
  Editor: RelationEditor,
};

export const dependencyUi: ColumnUi<RelationValue> = {
  align: "left",
  defaultWidth: 180,
  Cell: ({ value }) => <RelationCell value={value} testId="dependency-cell" />,
  Editor: RelationEditor,
};
