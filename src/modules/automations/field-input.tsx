"use client";

import { useState, type ReactNode } from "react";
import { useT } from "@/lib/i18n/client";
import type { ColumnDto } from "@/lib/board-types";
import type { FieldSpec, Txt } from "./types";
import type { UiCtx } from "./use-auto-context";
import styles from "./automations.module.css";

export type Values = Record<string, unknown>;
export const tx = (t: Txt | undefined, locale: "nl" | "en") => (t ? t[locale] ?? t.en : "");

const labelsOf = (c: ColumnDto | undefined): { id: number; text: string; isDone?: boolean }[] => (Array.isArray(c?.settings.labels) ? (c!.settings.labels as { id: number; text: string; isDone?: boolean }[]) : []);

export function pickLabel(labels: { id: number; text: string; isDone?: boolean }[], hint: unknown): string {
  const h = String(hint ?? "").toLowerCase();
  const hit =
    h === "done" ? labels.find((l) => l.isDone) ?? labels.find((l) => /^(done|afgerond|klaar)$/i.test(l.text))
    : h === "working" ? labels.find((l) => /working|bezig|in uitvoering|in progress/i.test(l.text))
    : h === "stuck" ? labels.find((l) => /stuck|vast|blocked|geblokkeerd/i.test(l.text))
    : h ? labels.find((l) => l.text.toLowerCase() === h)
    : undefined;
  return String((hit ?? labels.find((l) => l.text) ?? labels[0])?.id ?? "");
}

/** Initial value for a field/token given the board (so recipes work after one click). */
export function defaultValue(f: FieldSpec, ctx: UiCtx, values: Values): unknown {
  const boardId = (f.boardField && String(values[f.boardField] ?? "")) || ctx.boardId;
  const cols = ctx.boardColumns(boardId).filter((c) => c.type !== "name");
  switch (f.kind) {
    case "column": {
      const pool = f.columnTypes ? cols.filter((c) => f.columnTypes!.includes(c.type)) : cols;
      const idx = f.key === "status2" ? 1 : 0;
      return (pool[idx] ?? pool[0])?.id ?? "";
    }
    case "label": return pickLabel(labelsOf(cols.find((c) => c.id === values[f.of ?? ""])), f.default);
    case "users": return f.default === "@people" ? [cols.find((c) => c.type === "people") ? `@col:${cols.find((c) => c.type === "people")!.id}` : "@creator"] : f.default === "@creator" ? ["@creator"] : [];
    case "group": { const gs = ctx.boardGroups(boardId); return (gs.length > 1 ? gs[gs.length - 1] : gs[0])?.id ?? ""; }
    case "board": return ctx.boards.find((b) => b.id !== ctx.boardId)?.id ?? "";
    case "integration": return ctx.chatTargets[0]?.id ?? "";
    case "item": return "";
    case "value": return "";
    case "boolean": return f.default ?? false;
    case "select": return f.default !== undefined ? String(f.default) : f.options?.[0]?.value ?? "";
    case "mapping": return {};
    case "list": return [];
    case "number": return f.default ?? "";
    default: return typeof f.default === "string" ? f.default : "";
  }
}

export function Tok({ value, onChange, options, placeholder, testId, ariaLabel, optional }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; placeholder: string; testId?: string; ariaLabel?: string; optional?: boolean }) {
  return (
    <select className={`${styles.token} ${value === "" && !optional ? styles.tokenEmpty : ""}`} value={value} onChange={(e) => onChange(e.target.value)} data-testid={testId} aria-label={ariaLabel ?? placeholder}>
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function ListInput({ value, onChange, placeholder, testId }: { value: string[]; onChange: (v: string[]) => void; placeholder: string; testId?: string }) {
  const [text, setText] = useState(value.join("\n"));
  return <textarea className={styles.tokenArea} value={text} placeholder={placeholder} data-testid={testId} onChange={(e) => { setText(e.target.value); onChange(e.target.value.split("\n").map((s) => s.trim()).filter(Boolean)); }} />;
}

function UsersInput({ value, onChange, ctx, testId }: { value: string[]; onChange: (v: string[]) => void; ctx: UiCtx; testId?: string }) {
  const t = useT();
  const people = ctx.board.columns.filter((c) => c.type === "people");
  const options = [
    { value: "@creator", label: t("auto.user.creator") },
    { value: "@actor", label: t("auto.user.actor") },
    ...people.map((c) => ({ value: `@col:${c.id}`, label: t("auto.user.col", { col: c.title }) })),
    ...ctx.board.users.filter((u) => !u.isAiAgent).map((u) => ({ value: u.id, label: u.name })),
  ];
  const label = (v: string) => options.find((o) => o.value === v)?.label ?? v;
  return (
    <span data-testid={testId}>
      {value.map((v) => <span key={v} className={styles.tokenChip}>{label(v)}<button type="button" aria-label="x" onClick={() => onChange(value.filter((x) => x !== v))}>×</button></span>)}
      <Tok value="" onChange={(v) => v && !value.includes(v) && onChange([...value, v])} options={options.filter((o) => !value.includes(o.value))} placeholder={value.length ? t("auto.user.add") : t("auto.pick")} optional={value.length > 0} testId={testId ? `${testId}-add` : undefined} />
    </span>
  );
}

function MappingInput({ value, onChange, boardId, ctx }: { value: Record<string, string>; onChange: (v: Record<string, string>) => void; boardId: string; ctx: UiCtx }) {
  const t = useT();
  const targets = ctx.boardColumns(boardId).filter((c) => c.type !== "name");
  const sources = ctx.board.columns.filter((c) => c.type !== "name" && c.scope === "item");
  const rows = Object.entries(value);
  return (
    <div>
      {rows.map(([col, v], i) => (
        <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", margin: "4px 0" }}>
          <Tok value={col} onChange={(nc) => { const n: Record<string, string> = {}; rows.forEach(([k, val], j) => { n[j === i ? nc : k] = val; }); onChange(n); }} options={targets.map((c) => ({ value: c.id, label: c.title }))} placeholder={t("auto.pick")} />
          <span>=</span>
          <Tok value={v.startsWith("@col:") ? v : ""} onChange={(nv) => onChange({ ...value, [col]: nv })} options={sources.map((c) => ({ value: `@col:${c.id}`, label: c.title }))} placeholder={t("auto.field.mapping.value")} />
          <input className={`${styles.token} ${styles.tokenInput}`} value={v.startsWith("@col:") ? "" : v} placeholder="{item}" onChange={(e) => onChange({ ...value, [col]: e.target.value })} />
          <button type="button" className={styles.iconBtn} aria-label="x" onClick={() => { const n = { ...value }; delete n[col]; onChange(n); }}>×</button>
        </div>
      ))}
      <button type="button" className={styles.iconBtn} style={{ color: "var(--app-primary)" }} onClick={() => targets[0] && onChange({ ...value, [targets.find((c) => !(c.id in value))?.id ?? targets[0].id]: "" })}>+ {t("auto.field.mapping.add")}</button>
    </div>
  );
}

/** Renders one config field/token as an inline editor. */
export function FieldInput({ field, values, set, ctx, testId, optional }: { field: FieldSpec; values: Values; set: (key: string, value: unknown) => void; ctx: UiCtx; testId: string; optional?: boolean }): ReactNode {
  const t = useT();
  const L = ctx.locale;
  const v = values[field.key];
  const str = v === undefined || v === null ? "" : String(v);
  const label = tx(field.label, L);
  const boardId = (field.boardField && String(values[field.boardField] ?? "")) || ctx.boardId;
  if (boardId !== ctx.boardId) ctx.ensureBoard(boardId);
  const cols = ctx.boardColumns(boardId).filter((c) => c.type !== "name");
  switch (field.kind) {
    case "column": {
      const pool = field.columnTypes ? cols.filter((c) => field.columnTypes!.includes(c.type)) : cols;
      return <Tok optional={optional} value={str} onChange={(x) => set(field.key, x)} options={pool.map((c) => ({ value: c.id, label: c.title }))} placeholder={label} testId={testId} />;
    }
    case "label": {
      const col = ctx.boardColumns(ctx.boardId).find((c) => c.id === values[field.of ?? ""]);
      return <Tok optional={optional} value={str} onChange={(x) => set(field.key, x)} options={labelsOf(col).filter((l) => l.text).map((l) => ({ value: String(l.id), label: l.text }))} placeholder={label} testId={testId} />;
    }
    case "value": {
      const col = ctx.boardColumns(ctx.boardId).find((c) => c.id === values[field.of ?? ""]);
      if (col && (col.type === "status" || col.type === "dropdown")) return <Tok optional={optional} value={str} onChange={(x) => set(field.key, x)} options={labelsOf(col).filter((l) => l.text).map((l) => ({ value: String(l.id), label: l.text }))} placeholder={label} testId={testId} />;
      if (col?.type === "people") return <Tok optional={optional} value={str} onChange={(x) => set(field.key, x)} options={ctx.board.users.map((u) => ({ value: u.id, label: u.name }))} placeholder={label} testId={testId} />;
      if (col?.type === "checkbox") return <Tok optional={optional} value={str} onChange={(x) => set(field.key, x)} options={[{ value: "true", label: t("auto.field.yes") }, { value: "false", label: t("auto.field.no") }]} placeholder={label} testId={testId} />;
      return <input className={`${styles.token} ${styles.tokenInput}`} type={col?.type === "date" ? "date" : col?.type === "numbers" ? "number" : "text"} value={str} placeholder={label} data-testid={testId} onChange={(e) => set(field.key, e.target.value)} />;
    }
    case "group": return <Tok optional={optional} value={str} onChange={(x) => set(field.key, x)} options={ctx.boardGroups(boardId).map((g) => ({ value: g.id, label: g.title }))} placeholder={label} testId={testId} />;
    case "board": return <Tok optional={optional} value={str} onChange={(x) => set(field.key, x)} options={ctx.boards.map((b) => ({ value: b.id, label: b.name }))} placeholder={label} testId={testId} />;
    case "item": return <Tok optional={optional} value={str} onChange={(x) => set(field.key, x)} options={ctx.board.items.filter((i) => !i.parentItemId).map((i) => ({ value: i.id, label: i.name }))} placeholder={label} testId={testId} />;
    case "integration": return <Tok optional={optional} value={str} onChange={(x) => set(field.key, x)} options={ctx.chatTargets.map((i) => ({ value: i.id, label: `${i.name}${i.connected ? "" : ` (${t("auto.int.notConnected")})`}` }))} placeholder={label} testId={testId} />;
    case "user": return <Tok optional={optional} value={str} onChange={(x) => set(field.key, x)} options={ctx.board.users.map((u) => ({ value: u.id, label: u.name }))} placeholder={label} testId={testId} />;
    case "users": return <UsersInput value={Array.isArray(v) ? (v as string[]) : []} onChange={(x) => set(field.key, x)} ctx={ctx} testId={testId} />;
    case "select": return <Tok optional={optional} value={str} onChange={(x) => set(field.key, x)} options={(field.options ?? []).map((o) => ({ value: o.value, label: tx(o.label, L) }))} placeholder={label} testId={testId} />;
    case "boolean": return <label className={styles.fieldWrap}><input type="checkbox" checked={v === true} data-testid={testId} onChange={(e) => set(field.key, e.target.checked)} /> {label}</label>;
    case "number": return <input className={`${styles.token} ${styles.tokenInput}`} style={{ width: 70, minWidth: 50 }} type="number" min={0} value={str} placeholder={label} data-testid={testId} onChange={(e) => set(field.key, e.target.value === "" ? "" : Number(e.target.value))} />;
    case "time": return <input className={`${styles.token} ${styles.tokenInput}`} style={{ width: 90 }} type="time" value={str} data-testid={testId} onChange={(e) => set(field.key, e.target.value)} />;
    case "longtext": return <textarea className={styles.tokenArea} value={str} placeholder={tx(field.placeholder, L) || label} data-testid={testId} onChange={(e) => set(field.key, e.target.value)} />;
    case "list": return <ListInput value={Array.isArray(v) ? (v as string[]) : []} onChange={(x) => set(field.key, x)} placeholder={t("auto.field.list.ph")} testId={testId} />;
    case "mapping": return <MappingInput value={(v as Record<string, string>) ?? {}} onChange={(x) => set(field.key, x)} boardId={(field.boardField && String(values[field.boardField] ?? "")) || ctx.boardId} ctx={ctx} />;
    default: return <input className={`${styles.token} ${styles.tokenInput}`} value={str} placeholder={tx(field.placeholder, L) || label} data-testid={testId} onChange={(e) => set(field.key, e.target.value)} />;
  }
}
