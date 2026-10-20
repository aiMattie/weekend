"use client";

import { Button } from "@vibe/core";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import { cleanConfig } from "./describe";
import { defaultValue, FieldInput, Tok, tx, type Values } from "./field-input";
import type { AutomationDto, BlockMeta, Catalog, Definition, FieldSpec, Step } from "./types";
import type { UiCtx } from "./use-auto-context";
import styles from "./automations.module.css";

export interface Row { id: string; type: string; config: Values }
const BLOCK_FIELDS = new Set(["longtext", "list", "mapping"]);
let seq = 0;
const rid = () => `r${Date.now().toString(36)}${seq++}`;

export function configDefaults(block: BlockMeta | undefined, ctx: UiCtx): Values {
  const v: Values = {};
  const optionalPickers = new Set(["group", "board", "column", "label", "user", "users", "item", "integration", "value"]);
  for (const f of block?.fields ?? []) v[f.key] = !f.required && optionalPickers.has(f.kind) ? (f.kind === "users" ? [] : "") : defaultValue(f as FieldSpec, ctx, v);
  return v;
}

export function BlockRow({ kind, row, blocks, ctx, onChange, onRemove, onMove, testId }: {
  kind: BlockMeta["kind"]; row: Row; blocks: BlockMeta[]; ctx: UiCtx; onChange: (r: Row) => void; onRemove?: () => void; onMove?: (d: -1 | 1) => void; testId: string;
}) {
  const t = useT();
  const L = ctx.locale;
  const block = blocks.find((b) => b.id === row.type);
  const options = blocks.filter((b) => b.kind === kind).map((b) => ({ value: b.id, label: tx(b.title, L) }));
  const setField = (key: string, val: unknown) => {
    const config = { ...row.config, [key]: val };
    for (const f of block?.fields ?? []) if (f.of === key || f.boardField === key) config[f.key] = f.required ? defaultValue(f as FieldSpec, ctx, config) : "";
    onChange({ ...row, config });
  };
  return (
    <div className={styles.blockRow} data-testid={testId}>
      <Tok value={row.type} onChange={(type) => onChange({ ...row, type, config: configDefaults(blocks.find((b) => b.id === type), ctx) })} options={options} placeholder={t(kind === "trigger" ? "auto.chooseTrigger" : "auto.chooseBlock")} testId={`${testId}-block`} />
      {block?.fields.filter((f) => !BLOCK_FIELDS.has(f.kind)).map((f) => (
        <span key={f.key} className={styles.fieldWrap}>
          {f.kind !== "boolean" ? <span className={styles.fieldLabel}>{tx(f.label, L)}</span> : null}
          <FieldInput field={f as FieldSpec} values={row.config} set={setField} ctx={ctx} testId={`${testId}-${f.key}`} optional={!f.required} />
        </span>
      ))}
      {onRemove ? (
        <span className={styles.rowActions}>
          {onMove ? <><button type="button" className={styles.iconBtn} aria-label="up" onClick={() => onMove(-1)}>↑</button><button type="button" className={styles.iconBtn} aria-label="down" onClick={() => onMove(1)}>↓</button></> : null}
          <button type="button" className={styles.iconBtn} aria-label={t("auto.delete")} onClick={onRemove} data-testid={`${testId}-remove`}>×</button>
        </span>
      ) : null}
      {block?.fields.filter((f) => BLOCK_FIELDS.has(f.kind)).map((f) => (
        <div key={f.key} style={{ width: "100%" }}>
          <span className={styles.fieldLabel}>{tx(f.label, L)}</span>
          <FieldInput field={f as FieldSpec} values={row.config} set={setField} ctx={ctx} testId={`${testId}-${f.key}`} />
        </div>
      ))}
    </div>
  );
}

/** Flat definitions (action steps only, one condition group level) can be edited here. */
export function isSimpleDefinition(d: Definition): boolean {
  return d.steps.every((s) => s.type === "action") && (d.conditions?.conditions ?? []).every((c) => !("conditions" in c));
}

export function BuilderTab({ catalog, ctx, editing, onSaved }: { catalog: Catalog; ctx: UiCtx; editing: AutomationDto | null; onSaved: (a: AutomationDto) => void }) {
  const t = useT();
  const blocks = catalog.blocks;
  const def = editing?.definition;
  const [name, setName] = useState(editing?.name ?? "");
  const [trigger, setTrigger] = useState<Row>({ id: "t", type: def?.trigger.type ?? "", config: (def?.trigger.config as Values) ?? {} });
  const [op, setOp] = useState<"and" | "or">(def?.conditions?.op ?? "and");
  const [conds, setConds] = useState<Row[]>((def?.conditions?.conditions ?? []).map((c) => ({ id: rid(), type: (c as { type: string }).type, config: (c as { config: Values }).config })));
  const [steps, setSteps] = useState<Row[]>((def?.steps ?? []).filter((s): s is Extract<Step, { type: "action" }> => s.type === "action").map((s) => ({ id: s.id, type: s.block, config: s.config })));
  const [sentence, setSentence] = useState("");
  const [notes, setNotes] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const move = (i: number, d: -1 | 1) => setSteps((cur) => { const n = [...cur]; const j = i + d; if (j < 0 || j >= n.length) return cur; [n[i], n[j]] = [n[j], n[i]]; return n; });

  const fromText = async () => {
    setError(""); setNotes([]);
    try {
      const r = await api.post<{ name: string; definition: Definition | null; notes: string[] }>("/api/v1/automations/parse", { boardId: ctx.boardId, text: sentence });
      setNotes(r.notes);
      if (!r.definition) return;
      setName((n) => n || r.name);
      setTrigger({ id: "t", type: r.definition.trigger.type, config: r.definition.trigger.config as Values });
      setOp(r.definition.conditions?.op ?? "and");
      setConds((r.definition.conditions?.conditions ?? []).map((c) => ({ id: rid(), type: (c as { type: string }).type, config: (c as { config: Values }).config })));
      setSteps(r.definition.steps.filter((s): s is Extract<Step, { type: "action" }> => s.type === "action").map((s) => ({ id: rid(), type: s.block, config: s.config as Values })));
    } catch (e) { setError(e instanceof Error ? e.message : t("common.error")); }
  };

  const save = async () => {
    setError(""); setBusy(true);
    try {
      const body = {
        name: name.trim() || `${tx(blocks.find((b) => b.id === trigger.type)?.title, ctx.locale)} → ${steps.map((s) => tx(blocks.find((b) => b.id === s.type)?.title, ctx.locale)).join(", ")}`.slice(0, 190),
        trigger: { type: trigger.type, config: cleanConfig(trigger.config) },
        conditions: conds.length ? { op, conditions: conds.filter((c) => c.type).map((c) => ({ type: c.type, config: cleanConfig(c.config) })) } : undefined,
        steps: steps.filter((s) => s.type).map((s) => ({ type: "action", id: s.id, block: s.type, config: cleanConfig(s.config) })),
      };
      const saved = editing ? await api.patch<AutomationDto>(`/api/v1/automations/${editing.id}`, { ...body, conditions: body.conditions ?? { op: "and", conditions: [] } }) : await api.post<AutomationDto>("/api/v1/automations", { boardId: ctx.boardId, ...body });
      onSaved(saved);
    } catch (e) { setError(e instanceof Error ? e.message : t("common.error")); } finally { setBusy(false); }
  };

  if (editing && !isSimpleDefinition(editing.definition)) {
    return (
      <div className={`${styles.main} ${styles.mainGutter}`}>
        <div className={styles.panel}>{t("auto.workflowHint")}<div style={{ marginTop: 10 }}><Link href={`/workflows/${editing.id}`}><Button size="small">{t("auto.openWorkflow")}</Button></Link></div></div>
      </div>
    );
  }
  return (
    <div className={`${styles.main} ${styles.mainGutter}`} data-testid="auto-builder">
      <div className={styles.panel}>
        <h3 className={styles.panelTitle}>{t("auto.describe")}</h3>
        <div className={styles.btnRow}>
          <input className={styles.nameInput} style={{ flex: 1, width: "auto", padding: "7px 10px", border: "1px solid var(--app-border)", borderRadius: 4, fontSize: 14 }} value={sentence} placeholder={t("auto.describePh")} onChange={(e) => setSentence(e.target.value)} data-testid="builder-sentence" />
          <Button size="small" kind="secondary" onClick={() => void fromText()} disabled={sentence.trim().length < 3} data-testid="builder-parse">{t("auto.fromText")}</Button>
        </div>
        {notes.map((n, i) => <div key={i} className={styles.errText}>{n}</div>)}
      </div>
      <div className={styles.panel}>
        <h3 className={styles.panelTitle}>{t("auto.when")}</h3>
        <BlockRow kind="trigger" row={trigger} blocks={blocks} ctx={ctx} onChange={setTrigger} testId="builder-trigger" />
      </div>
      <div className={styles.panel}>
        <h3 className={styles.panelTitle}>{t("auto.if")}
          {conds.length > 1 ? <button type="button" className={styles.token} onClick={() => setOp(op === "and" ? "or" : "and")} data-testid="builder-op">{op === "and" ? t("auto.and") : t("auto.or")}</button> : null}
        </h3>
        {conds.map((c, i) => (
          <BlockRow key={c.id} kind="condition" row={c} blocks={blocks} ctx={ctx} testId={`builder-cond-${i}`} onChange={(r) => setConds((cur) => cur.map((x) => (x.id === c.id ? r : x)))} onRemove={() => setConds((cur) => cur.filter((x) => x.id !== c.id))} />
        ))}
        <Button size="small" kind="tertiary" onClick={() => setConds((cur) => [...cur, { id: rid(), type: "", config: {} }])} data-testid="builder-add-condition">+ {t("auto.addCondition")}</Button>
      </div>
      <div className={styles.panel}>
        <h3 className={styles.panelTitle}>{t("auto.then")}</h3>
        {steps.map((s, i) => (
          <BlockRow key={s.id} kind="action" row={s} blocks={blocks} ctx={ctx} testId={`builder-action-${i}`} onChange={(r) => setSteps((cur) => cur.map((x) => (x.id === s.id ? r : x)))} onRemove={() => setSteps((cur) => cur.filter((x) => x.id !== s.id))} onMove={(d) => move(i, d)} />
        ))}
        <Button size="small" kind="tertiary" onClick={() => setSteps((cur) => [...cur, { id: rid(), type: "", config: {} }])} data-testid="builder-add-action">+ {t("auto.addAction")}</Button>
      </div>
      <div className={styles.footer}>
        <input className={styles.nameInput} style={{ padding: "7px 10px", border: "1px solid var(--app-border)", borderRadius: 4, fontSize: 14 }} value={name} placeholder={t("auto.name")} onChange={(e) => setName(e.target.value)} data-testid="builder-name" />
        <Button kind="primary" onClick={() => void save()} loading={busy} disabled={busy || !trigger.type || !steps.some((s) => s.type)} data-testid="builder-save">{editing ? t("auto.update") : t("auto.save")}</Button>
        {error ? <span className={styles.errText} role="alert" data-testid="builder-error">{error}</span> : null}
      </div>
    </div>
  );
}
