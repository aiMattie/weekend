"use client";

import { Icon } from "@vibe/core";
import { Add, Delete } from "@vibe/icons";
import { useT } from "@/lib/i18n/client";
import type { BoardFull, ColumnDto } from "@/lib/board-types";
import { NAME_COLUMN_SORT, type FilterRule, type ViewState } from "@/lib/view-state";
import { getColumnLogic } from "@/server/columns/registry";
import { Popover } from "../ui/popover";
import { OperandInput, operandKind } from "./operand-input";
import styles from "../toolbar.module.css";

export type PopProps = {
  anchorEl: HTMLElement | null; onClose: () => void; board: BoardFull; state: ViewState; setState: (p: Partial<ViewState>) => void;
  /** "Save as new view" shows in every toolbar popover; enabled while the view has unsaved changes */
  dirty?: boolean; onSaveAsNew?: () => void;
};

/** Popover header: title, optional hint, and the grey "Save as new view" button. */
export function PopHeader({ title, dirty, onSaveAsNew, onClear }: { title: string; dirty?: boolean; onSaveAsNew?: () => void; onClear?: () => void }) {
  const t = useT();
  return (
    <div className={styles.popHeader}>
      <div className={styles.popTitle}>{title}</div>
      <span className={styles.grow} />
      {onClear ? <button type="button" className={styles.popClear} onClick={onClear} data-testid="pop-clear">{t("toolbar.clear")}</button> : null}
      {onSaveAsNew ? <button type="button" className={styles.popSave} disabled={!dirty} onClick={onSaveAsNew} data-testid="pop-save-as-new-view">{t("view.saveAsNew")}</button> : null}
    </div>
  );
}

export const itemColumns = (b: BoardFull) => b.columns.filter((c) => c.scope === "item");
export const dataColumns = (b: BoardFull) => itemColumns(b).filter((c) => c.type !== "name");
const nameTitle = (b: BoardFull) => itemColumns(b).find((c) => c.type === "name")?.title ?? "Name";

/** Pseudo column for the item name (id NAME_COLUMN_SORT) so rules can filter on it. */
const NAME_COL = (b: BoardFull): ColumnDto => ({ id: NAME_COLUMN_SORT, boardId: b.board.id, key: "name", title: nameTitle(b), type: "text", scope: "item", description: null, settings: {}, position: -1, width: null });

export function FilterPopover({ anchorEl, onClose, board, state, setState, dirty, onSaveAsNew }: PopProps) {
  const t = useT();
  const cols = [NAME_COL(board), ...dataColumns(board)];
  const colOf = (id: string) => cols.find((c) => c.id === id);
  const update = (i: number, patch: Partial<FilterRule>) => setState({ filters: state.filters.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) });
  const firstOp = (c: ColumnDto) => getColumnLogic(c.type).filter.operators[0]?.id ?? "is_empty";
  const add = () => {
    // first column with real operators (skips subitems/files whose only operators are "is (not) empty")
    const c = cols.find((x) => x.id !== NAME_COLUMN_SORT && getColumnLogic(x.type).filter.operators.length > 2) ?? cols[0];
    setState({ filters: [...state.filters, { columnId: c.id, op: firstOp(c), ...(state.filters.length ? { join: "and" as const } : {}) }] });
  };
  const opLabel = (op: { id: string; label: string }) => {
    const k = `filter.op.${op.id}`;
    const v = t(k);
    return v === k ? op.label : v;
  };
  return (
    <Popover anchorEl={anchorEl} onClose={onClose} style={{ maxWidth: "none" }}>
      <div className={styles.pop} style={{ width: 720, maxWidth: "92vw" }} data-testid="filter-popover">
        <PopHeader title={t("toolbar.filterTitle")} dirty={dirty} onSaveAsNew={onSaveAsNew} />
        <div className={styles.popHint}>{t("toolbar.filterHint")}</div>
        {state.filters.map((r, i) => {
          const col = colOf(r.columnId);
          const ops = col ? getColumnLogic(col.type).filter.operators : [];
          return (
            <div key={i} className={styles.ruleRow} data-testid="filter-rule">
              <div className={styles.joinCell}>
                {i === 0 ? (
                  <span className={styles.joinLabel}>{t("toolbar.where")}</span>
                ) : (
                  <select className={styles.select} value={r.join ?? "and"} onChange={(e) => update(i, { join: e.target.value as "and" | "or" })} data-testid="filter-join" aria-label="join">
                    <option value="and">{t("toolbar.and")}</option>
                    <option value="or">{t("toolbar.or")}</option>
                  </select>
                )}
              </div>
              <select className={`${styles.select} ${styles.colSelect}`} value={r.columnId} data-testid="filter-column" onChange={(e) => {
                const nc = colOf(e.target.value)!;
                update(i, { columnId: nc.id, op: firstOp(nc), operand: undefined });
              }}>
                {cols.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
              <select className={`${styles.select} ${styles.opSelect}`} value={r.op} data-testid="filter-op" onChange={(e) => {
                // keep the value when the new operator takes the same kind of input
                const k0 = col ? operandKind(col, r.op, board) : "none";
                const k1 = col ? operandKind(col, e.target.value, board) : "none";
                update(i, { op: e.target.value, ...(k0 !== "none" && k1 !== "none" && k0 !== k1 ? { operand: undefined } : {}) });
              }}>
                {ops.map((o) => <option key={o.id} value={o.id}>{opLabel(o)}</option>)}
              </select>
              <div className={styles.operandCell}>{col ? <OperandInput column={col} rule={r} board={board} onChange={(v) => update(i, { operand: v })} /> : null}</div>
              <button type="button" className={styles.iconBtn} onClick={() => setState({ filters: state.filters.filter((_, idx) => idx !== i) })} aria-label={t("toolbar.removeRule")} data-testid="filter-remove">
                <Icon icon={Delete} size={16} ignoreFocusStyle />
              </button>
            </div>
          );
        })}
        <div className={styles.popRow}>
          <button type="button" className={styles.link} onClick={add} data-testid="filter-add"><Icon icon={Add} size={14} ignoreFocusStyle /> {t("toolbar.addRule")}</button>
          {state.filters.length ? <button type="button" className={styles.link} onClick={() => setState({ filters: [] })} data-testid="filter-clear">{t("toolbar.clearFilters")}</button> : null}
        </div>
      </div>
    </Popover>
  );
}
