"use client";

import { Button, IconButton } from "@vibe/core";
import { Add, Delete } from "@vibe/icons";
import { getColumnLogic } from "@/server/columns/registry";
import { useT } from "@/lib/i18n/client";
import styles from "./dashboards.module.css";
import type { ColumnsPayload } from "./types";

export interface Rule { columnId: string; op: string; operand?: unknown }

const SKIP = new Set(["file", "name", "button", "doc"]);

export function Select({ value, onChange, options, testId, placeholder }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; testId?: string; placeholder?: string }) {
  return (
    <select className={styles.select} value={value} onChange={(e) => onChange(e.target.value)} data-testid={testId}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function CheckList({ options, value, onChange, testId }: { options: { value: string; label: string; hint?: string }[]; value: string[]; onChange: (v: string[]) => void; testId?: string }) {
  return (
    <div className={styles.checkList} data-testid={testId}>
      {options.map((o) => (
        <label key={o.value} className={styles.checkRow}>
          <input type="checkbox" checked={value.includes(o.value)} onChange={() => onChange(value.includes(o.value) ? value.filter((x) => x !== o.value) : [...value, o.value])} aria-label={o.label} />
          <span>{o.label}</span>{o.hint && <small>{o.hint}</small>}
        </label>
      ))}
    </div>
  );
}

function OperandInput({ rule, col, users, onChange }: { rule: Rule; col: ColumnsPayload["columns"][number]; users: ColumnsPayload["users"]; onChange: (v: unknown) => void }) {
  const arr = Array.isArray(rule.operand) ? (rule.operand as unknown[]).map(String) : [];
  if ((col.type === "status" || col.type === "dropdown") && col.labels) return <CheckList options={col.labels.filter((l) => l.text).map((l) => ({ value: String(l.id), label: l.text }))} value={arr} onChange={onChange} />;
  if (col.type === "people") return <CheckList options={users.map((u) => ({ value: u.id, label: u.name }))} value={arr} onChange={onChange} />;
  if (col.type === "date" || col.type === "timeline") return <input className={styles.input} type="date" value={String(rule.operand ?? "")} onChange={(e) => onChange(e.target.value)} />;
  return <input className={styles.input} value={String(rule.operand ?? "")} onChange={(e) => onChange(e.target.value)} />;
}

/** Rule list: column (union of the boards' columns), operator (from the column logic) and operand. */
export function FilterEditor({ columns, rules, onChange }: { columns: ColumnsPayload; rules: Rule[]; onChange: (r: Rule[]) => void }) {
  const t = useT();
  const cols = columns.columns.filter((c) => !SKIP.has(c.type));
  const typeLabel = (type: string) => { const k = `column.type.${type}`; const v = t(k); return v === k ? type : v; };
  const set = (i: number, patch: Partial<Rule>) => onChange(rules.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div data-testid="filter-editor">
      {rules.map((r, i) => {
        const col = cols.find((c) => c.id === r.columnId) ?? columns.columns.find((c) => c.id === r.columnId);
        const ops = col ? getColumnLogic(col.type).filter.operators : [];
        const needs = ops.find((o) => o.id === r.op)?.needsOperand ?? true;
        return (
          <div key={i} className={styles.ruleRow} data-testid="filter-rule">
            <Select value={r.columnId} testId="filter-column" onChange={(v) => { const c = cols.find((x) => x.id === v); set(i, { columnId: v, op: c ? getColumnLogic(c.type).filter.operators[0]?.id ?? "is" : "is", operand: undefined }); }} options={cols.map((c) => ({ value: c.id, label: `${c.title} (${typeLabel(c.type)})` }))} placeholder={t("dashboards.chooseColumn")} />
            <Select value={r.op} testId="filter-op" onChange={(v) => set(i, { op: v, operand: undefined })} options={ops.map((o) => ({ value: o.id, label: t(`filter.op.${o.id}`) }))} />
            {col && needs && <div className="full" style={{ gridColumn: "1 / -1" }}><OperandInput rule={r} col={col} users={columns.users} onChange={(v) => set(i, { operand: v })} /></div>}
            <div style={{ gridColumn: "1 / -1", textAlign: "right" }}><IconButton icon={Delete} size="xs" kind="tertiary" aria-label={t("common.delete")} onClick={() => onChange(rules.filter((_, j) => j !== i))} /></div>
          </div>
        );
      })}
      <Button kind="tertiary" size="small" leftIcon={Add} onClick={() => onChange([...rules, { columnId: cols[0]?.id ?? "", op: cols[0] ? getColumnLogic(cols[0].type).filter.operators[0]?.id ?? "is" : "is" }])} data-testid="add-filter-rule">{t("dashboards.addFilter")}</Button>
    </div>
  );
}
