"use client";

import { UserAvatar } from "@/components/columns/shared";
import { contrastText } from "@/lib/colors";
import { useT } from "@/lib/i18n/client";
import type { BoardFull, ColumnDto } from "@/lib/board-types";
import type { FilterRule } from "@/lib/view-state";
import { getColumnLogic } from "@/server/columns/registry";
import styles from "../toolbar.module.css";

export interface OperandOption { value: string | number; label: string; color?: string; userId?: string }

/** Selectable options for set operators (any_of / none_of); null = free text. */
export function optionsFor(col: ColumnDto, board: BoardFull): OperandOption[] | null {
  const labels = col.settings.labels as { id: number; text: string; color?: string }[] | undefined;
  if (col.type === "status") return (labels ?? []).filter((l) => l.text).map((l) => ({ value: l.id, label: l.text, color: l.color }));
  if (col.type === "dropdown") return (labels ?? []).filter((l) => l.text).map((l) => ({ value: l.id, label: l.text }));
  if (col.type === "people" || col.type === "vote" || col.type === "item_assignees") return board.users.map((u) => ({ value: u.id, label: u.name, userId: u.id }));
  if (col.type === "tags") {
    const seen = new Map<string, string>();
    for (const it of board.items) for (const t of ((it.values[col.id] as { tags?: { id: string; name: string }[] } | undefined)?.tags ?? [])) seen.set(t.id, t.name);
    return [...seen.entries()].map(([value, label]) => ({ value, label }));
  }
  if (Array.isArray(labels) && labels.length) return labels.filter((l) => l.text).map((l) => ({ value: l.id, label: l.text, color: l.color }));
  return null;
}

const isoDay = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const SET_OPS = new Set(["any_of", "none_of", "voted_by"]);
const NUMBER_OPS = new Set(["eq", "neq", "gt", "gte", "lt", "lte"]);
const DATE_TYPES = new Set(["date", "timeline", "week"]);

export type OperandKind = "none" | "set" | "setText" | "number" | "date" | "text";

/** Which input an operator of a column needs. Exported for tests. */
export function operandKind(col: ColumnDto, op: string, board: BoardFull): OperandKind {
  const def = getColumnLogic(col.type).filter.operators.find((o) => o.id === op);
  if (!def?.needsOperand) return "none";
  if (SET_OPS.has(op)) return optionsFor(col, board) ? "set" : "setText";
  if (NUMBER_OPS.has(op)) return "number";
  if (DATE_TYPES.has(col.type) && ["is", "before", "after", "overlaps"].includes(op)) return "date";
  return "text";
}

export function OperandInput({ column, rule, onChange, board }: { column: ColumnDto; rule: FilterRule; onChange: (v: unknown) => void; board: BoardFull }) {
  const t = useT();
  const kind = operandKind(column, rule.op, board);
  if (kind === "none") return <span className={styles.operandNone} />;
  if (kind === "set") {
    const opts = optionsFor(column, board) ?? [];
    const cur = Array.isArray(rule.operand) ? (rule.operand as (string | number)[]).map(String) : [];
    const toggle = (v: string | number) => onChange(cur.includes(String(v)) ? (rule.operand as (string | number)[]).filter((x) => String(x) !== String(v)) : [...cur, v]);
    if (!opts.length) return <span className={styles.operandNone}>{t("toolbar.noOptions")}</span>;
    return (
      <div className={styles.chips} data-testid="filter-operand" role="group">
        {opts.map((o) => {
          const on = cur.includes(String(o.value));
          return (
            <button
              key={String(o.value)}
              type="button"
              className={`${styles.chip} ${on ? styles.chipOn : ""}`}
              style={o.color ? { background: on ? o.color : "#fff", color: on ? contrastText(o.color) : "#323338", borderColor: o.color } : undefined}
              aria-pressed={on}
              data-testid="filter-operand-option"
              data-label={o.label}
              onClick={() => toggle(o.value)}
            >
              {o.userId ? <UserAvatar user={board.users.find((u) => u.id === o.userId)!} size="xs" /> : null}
              {o.label}
            </button>
          );
        })}
      </div>
    );
  }
  if (kind === "date") {
    const v = typeof rule.operand === "string" ? rule.operand : "";
    return (
      <div className={styles.dateOperand}>
        <input className={styles.select} type="date" value={v.slice(0, 10)} aria-label={t("toolbar.pickDate")} onChange={(e) => onChange(e.target.value)} data-testid="filter-operand" />
        <button type="button" className={styles.miniBtn} onClick={() => onChange(isoDay(-1))}>{t("toolbar.yesterday")}</button>
        <button type="button" className={styles.miniBtn} onClick={() => onChange(isoDay(0))} data-testid="filter-date-today">{t("toolbar.today")}</button>
        <button type="button" className={styles.miniBtn} onClick={() => onChange(isoDay(1))}>{t("toolbar.tomorrow")}</button>
      </div>
    );
  }
  return (
    <input
      className={styles.select}
      type={kind === "number" ? "number" : "text"}
      value={Array.isArray(rule.operand) ? rule.operand.join(",") : String(rule.operand ?? "")}
      placeholder={t("toolbar.operandPlaceholder")}
      onChange={(e) => onChange(kind === "setText" ? e.target.value.split(",").map((s) => s.trim()).filter(Boolean) : e.target.value)}
      data-testid="filter-operand"
    />
  );
}
