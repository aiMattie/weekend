"use client";

import type { BoardFull, ColumnDto } from "@/lib/board-types";
import styles from "./form.module.css";

interface Props { board: BoardFull; column: ColumnDto; value: unknown; onChange: (v: unknown) => void; id: string }

/** One input of the in-board form, chosen by column type. */
export function FormFieldInput({ board, column, value, onChange, id }: Props) {
  const testId = `form-input-${column.key}`;
  switch (column.type) {
    case "long_text":
      return <textarea id={id} className={styles.input} rows={3} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} data-testid={testId} />;
    case "numbers":
      return <input id={id} className={styles.input} type="number" value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} data-testid={testId} />;
    case "date":
      return <input id={id} className={styles.input} type="date" value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} data-testid={testId} />;
    case "timeline": {
      const v = (value as { from?: string; to?: string } | undefined) ?? {};
      return (
        <span className={styles.pair}>
          <input id={id} className={styles.input} type="date" value={v.from ?? ""} onChange={(e) => onChange({ ...v, from: e.target.value })} data-testid={`${testId}-from`} />
          <input className={styles.input} type="date" value={v.to ?? ""} onChange={(e) => onChange({ ...v, to: e.target.value })} data-testid={`${testId}-to`} />
        </span>
      );
    }
    case "checkbox":
      return <input id={id} type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} data-testid={testId} />;
    case "status": {
      const labels = (column.settings.labels as { id: number; text: string; color: string }[] | undefined) ?? [];
      return (
        <select id={id} className={styles.input} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} data-testid={testId}>
          <option value="" />
          {labels.filter((l) => l.text).map((l) => <option key={l.id} value={l.id}>{l.text}</option>)}
        </select>
      );
    }
    case "dropdown": {
      const labels = (column.settings.labels as { id: number; text: string }[] | undefined) ?? [];
      const sel = Array.isArray(value) ? (value as number[]).map(String) : [];
      return (
        <span className={styles.chips} data-testid={testId}>
          {labels.map((l) => {
            const on = sel.includes(String(l.id));
            return <button key={l.id} type="button" className={`${styles.chip} ${on ? styles.chipOn : ""}`} onClick={() => onChange(on ? sel.filter((x) => x !== String(l.id)) : column.settings.allowMultiple === false ? [String(l.id)] : [...sel, String(l.id)])} data-testid={`${testId}-${l.text}`}>{l.text}</button>;
          })}
        </span>
      );
    }
    case "people": {
      const sel = Array.isArray(value) ? (value as string[]) : [];
      return (
        <span className={styles.chips} data-testid={testId}>
          {board.users.filter((u) => !u.isAiAgent).map((u) => {
            const on = sel.includes(u.id);
            return <button key={u.id} type="button" className={`${styles.chip} ${on ? styles.chipOn : ""}`} onClick={() => onChange(on ? sel.filter((x) => x !== u.id) : [...sel, u.id])} data-testid={`${testId}-${u.name}`}>{u.name}</button>;
          })}
        </span>
      );
    }
    case "email":
      return <input id={id} className={styles.input} type="email" value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} data-testid={testId} />;
    case "link":
      return <input id={id} className={styles.input} type="url" placeholder="https://" value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} data-testid={testId} />;
    default:
      return <input id={id} className={styles.input} type="text" value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} data-testid={testId} />;
  }
}

