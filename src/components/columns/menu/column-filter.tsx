"use client";

import { useState } from "react";
import { Popover } from "@/components/board/ui/popover";
import type { BoardFull, ColumnDto } from "@/lib/board-types";
import { useT } from "@/lib/i18n/client";
import type { FilterRule } from "@/lib/view-state";
import { getColumnLogic } from "@/server/columns/registry";
import { useAllTags } from "../lookups";
import css from "./menu.module.css";

/** Quick filter of one column from its header menu: pick an operator and a value, apply to the view. */
export function ColumnFilterPopover({ anchorEl, column, board, rules, onApply, onClose }: {
  anchorEl: HTMLElement | null;
  column: ColumnDto;
  board: BoardFull;
  rules: FilterRule[];
  onApply: (rules: FilterRule[]) => void;
  onClose: () => void;
}) {
  const t = useT();
  const logic = getColumnLogic(column.type);
  const existing = rules.find((r) => r.columnId === column.id);
  const [op, setOp] = useState(existing?.op ?? logic.filter.operators[0]?.id ?? "is_empty");
  const [operand, setOperand] = useState<unknown>(existing?.operand ?? (isSetType(column.type, op) ? [] : ""));
  const opDef = logic.filter.operators.find((o) => o.id === op);
  const { tags } = useAllTags(column.type === "tags");
  const apply = () => onApply([...rules.filter((r) => r.columnId !== column.id), { columnId: column.id, op, ...(opDef?.needsOperand ? { operand } : {}) }]);
  const clear = () => onApply(rules.filter((r) => r.columnId !== column.id));
  const opLabel = (id: string, fallback: string) => { const k = `filter.op.${id}`; const v = t(k); return v === k ? fallback : v; };

  return (
    <Popover anchorEl={anchorEl} onClose={onClose}>
      <div className={css.filterPanel} data-testid="column-filter">
        <b style={{ fontSize: 13 }}>{t("col.filter.title", { name: column.title })}</b>
        <select value={op} data-testid="column-filter-op" onChange={(e) => { setOp(e.target.value); setOperand(isSetType(column.type, e.target.value) ? [] : ""); }}>
          {logic.filter.operators.map((o) => <option key={o.id} value={o.id}>{opLabel(o.id, o.label)}</option>)}
        </select>
        {opDef?.needsOperand ? <Operand column={column} board={board} op={op} value={operand} onChange={setOperand} tags={tags} /> : null}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          {existing ? <button type="button" onClick={clear} style={btn}>{t("col.filter.clear")}</button> : null}
          <button type="button" onClick={() => { apply(); onClose(); }} data-testid="column-filter-apply" style={{ ...btn, background: "var(--app-primary)", color: "#fff" }}>{t("col.filter.apply")}</button>
        </div>
      </div>
    </Popover>
  );
}

const btn = { border: 0, borderRadius: 4, padding: "6px 12px", cursor: "pointer", fontSize: 14, background: "transparent" } as const;
const isSetType = (type: string, op: string) => ["status", "dropdown", "people", "tags", "country", "color_picker"].includes(type) && (op === "any_of" || op === "none_of");

function Operand({ column, board, op, value, onChange, tags }: { column: ColumnDto; board: BoardFull; op: string; value: unknown; onChange: (v: unknown) => void; tags: { id: string; name: string }[] }) {
  const type = column.type;
  const arr = Array.isArray(value) ? (value as unknown[]).map(String) : [];
  const toggle = (id: string, asNumber = false) => onChange(arr.includes(id) ? arr.filter((x) => x !== id).map((x) => (asNumber ? Number(x) : x)) : [...arr, id].map((x) => (asNumber ? Number(x) : x)));
  if (isSetType(type, op)) {
    let options: { id: string; label: string }[] = [];
    if (type === "status" || type === "dropdown") options = ((column.settings.labels as { id: number; text: string }[] | undefined) ?? []).filter((l) => l.text).map((l) => ({ id: String(l.id), label: l.text }));
    else if (type === "people") options = board.users.map((u) => ({ id: u.id, label: u.name }));
    else if (type === "tags") options = tags.map((x) => ({ id: x.id, label: x.name }));
    return (
      <div className={css.boardPick} data-testid="column-filter-operand">
        {options.map((o) => <label key={o.id} className={css.check}><input type="checkbox" checked={arr.includes(o.id)} onChange={() => toggle(o.id, type === "status" || type === "dropdown")} />{o.label}</label>)}
      </div>
    );
  }
  const inputType = ["date", "timeline", "week", "creation_log", "last_updated"].includes(type) && !["overdue", "today"].includes(op) ? "date" : ["numbers", "rating", "formula", "progress", "auto_number", "vote"].includes(type) ? "number" : "text";
  return <input type={inputType} value={String(value ?? "")} data-testid="column-filter-operand" onChange={(e) => onChange(e.target.value)} />;
}
