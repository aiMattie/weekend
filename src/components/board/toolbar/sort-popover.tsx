"use client";

import { Icon } from "@vibe/core";
import { Add, Delete, DropdownChevronDown, DropdownChevronUp } from "@vibe/icons";
import { useT } from "@/lib/i18n/client";
import { NAME_COLUMN_SORT, type SortRule } from "@/lib/view-state";
import { Popover } from "../ui/popover";
import { dataColumns, itemColumns, PopHeader, type PopProps } from "./filter-popover";
import styles from "../toolbar.module.css";

export function SortPopover({ anchorEl, onClose, board, state, setState, dirty, onSaveAsNew }: PopProps) {
  const t = useT();
  const cols = [{ id: NAME_COLUMN_SORT, title: itemColumns(board).find((c) => c.type === "name")?.title ?? "Name" }, ...dataColumns(board)];
  const update = (i: number, patch: Partial<SortRule>) => setState({ sort: state.sort.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) });
  const swap = (i: number, j: number) => {
    const next = [...state.sort];
    [next[i], next[j]] = [next[j], next[i]];
    setState({ sort: next });
  };
  const unused = cols.find((c) => !state.sort.some((r) => r.columnId === c.id)) ?? cols[0];
  return (
    <Popover anchorEl={anchorEl} onClose={onClose} style={{ maxWidth: "none" }}>
      <div className={styles.pop} style={{ width: 460, maxWidth: "92vw" }} data-testid="sort-popover">
        <PopHeader title={t("toolbar.sortTitle")} dirty={dirty} onSaveAsNew={onSaveAsNew} />
        <div className={styles.popHint}>{t("toolbar.sortHint")}</div>
        {state.sort.map((r, i) => (
          <div key={i} className={styles.ruleRow} data-testid="sort-rule">
            <span className={styles.levelNo}>{i + 1}</span>
            <select className={styles.select} value={r.columnId} onChange={(e) => update(i, { columnId: e.target.value })} data-testid="sort-column">
              {cols.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
            <select className={`${styles.select} ${styles.opSelect}`} value={r.dir} onChange={(e) => update(i, { dir: e.target.value as "asc" | "desc" })} data-testid="sort-dir">
              <option value="asc">{t("toolbar.ascending")}</option>
              <option value="desc">{t("toolbar.descending")}</option>
            </select>
            <button type="button" className={styles.iconBtn} disabled={i === 0} onClick={() => swap(i, i - 1)} aria-label={t("toolbar.sortUp")} data-testid="sort-up"><Icon icon={DropdownChevronUp} size={16} ignoreFocusStyle /></button>
            <button type="button" className={styles.iconBtn} disabled={i === state.sort.length - 1} onClick={() => swap(i, i + 1)} aria-label={t("toolbar.sortDown")} data-testid="sort-down"><Icon icon={DropdownChevronDown} size={16} ignoreFocusStyle /></button>
            <button type="button" className={styles.iconBtn} onClick={() => setState({ sort: state.sort.filter((_, idx) => idx !== i) })} aria-label={t("toolbar.clear")} data-testid="sort-remove"><Icon icon={Delete} size={16} ignoreFocusStyle /></button>
          </div>
        ))}
        <div className={styles.popRow}>
          <button type="button" className={styles.link} onClick={() => setState({ sort: [...state.sort, { columnId: unused.id, dir: "asc" }] })} data-testid="sort-add"><Icon icon={Add} size={14} ignoreFocusStyle /> {t("toolbar.addSortLevel")}</button>
          {state.sort.length ? <button type="button" className={styles.link} onClick={() => setState({ sort: [] })} data-testid="sort-clear">{t("toolbar.clear")}</button> : null}
        </div>
      </div>
    </Popover>
  );
}
