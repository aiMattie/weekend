"use client";

import { Button, IconButton } from "@vibe/core";
import { Close } from "@vibe/icons";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import type { WidgetField } from "../widgets/types";
import { getWidgetDefinition } from "../widgets/registry";
import { widgetComponents } from "./widget-components";
import { CheckList, FilterEditor, Select, type Rule } from "./filter-editor";
import styles from "./dashboards.module.css";
import type { ColumnsPayload, WidgetDto, WidgetResultDto } from "./types";

type Settings = Record<string, unknown>;
const AGGS = ["count", "sum", "avg", "min", "max", "median"];

function MetricsEditor({ value, onChange, columns }: { value: { label: string; aggregation: string; columnId?: string }[]; onChange: (v: unknown) => void; columns: ColumnsPayload }) {
  const t = useT();
  const nums = columns.columns.filter((c) => c.type === "numbers");
  const set = (i: number, patch: Record<string, unknown>) => onChange(value.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  return (
    <div>
      {value.map((m, i) => (
        <div key={i} className={styles.ruleRow} data-testid="metric-row">
          <Select value={m.aggregation} testId="metric-agg" onChange={(v) => set(i, { aggregation: v })} options={AGGS.map((a) => ({ value: a, label: t(`dashboards.agg.${a}`) }))} />
          {m.aggregation !== "count" ? <Select value={m.columnId ?? ""} testId="metric-column" onChange={(v) => set(i, { columnId: v || undefined })} options={nums.map((c) => ({ value: c.id, label: c.title }))} placeholder={t("dashboards.chooseColumn")} /> : <span />}
          <input className={styles.input} style={{ gridColumn: "1 / -1" }} placeholder={t("dashboards.metricLabel")} value={m.label} onChange={(e) => set(i, { label: e.target.value })} />
          {value.length > 1 && <Button kind="tertiary" size="xs" onClick={() => onChange(value.filter((_, j) => j !== i))}>{t("common.delete")}</Button>}
        </div>
      ))}
      {value.length < 4 && <Button kind="tertiary" size="small" onClick={() => onChange([...value, { label: "", aggregation: "count" }])} data-testid="add-metric">{t("dashboards.addMetric")}</Button>}
    </div>
  );
}

function FieldInput({ field, settings, set, columns, boardIds }: { field: WidgetField; settings: Settings; set: (k: string, v: unknown) => void; columns: ColumnsPayload; boardIds: string[] }) {
  const t = useT();
  const v = settings[field.key];
  switch (field.kind) {
    case "boards":
      return <CheckList testId="field-boards" options={columns.boards.filter((b) => boardIds.includes(b.id)).map((b) => ({ value: b.id, label: b.name }))} value={(v as string[]) ?? []} onChange={(x) => set(field.key, x)} />;
    case "select":
      return <Select value={String(v ?? "")} testId={`field-${field.key}`} onChange={(x) => set(field.key, x)} options={(field.options ?? []).map((o) => ({ value: o.value, label: t(`dashboards.opt.${o.value}`) }))} />;
    case "column":
    case "columns": {
      const eligible = columns.columns.filter((c) => !field.columnTypes || field.columnTypes.includes(c.type));
      const opts = [...(field.special ? [{ value: "__board", label: "Board" }, { value: "__group", label: "Group" }] : []), ...eligible.map((c) => ({ value: c.id, label: c.title }))];
      if (field.kind === "columns") return <CheckList testId={`field-${field.key}`} options={opts} value={(v as string[]) ?? []} onChange={(x) => set(field.key, x)} />;
      return <Select value={String(v ?? "")} testId={`field-${field.key}`} onChange={(x) => set(field.key, x || undefined)} options={opts} placeholder={t("dashboards.auto")} />;
    }
    case "number": return <input className={styles.input} type="number" value={Number(v ?? 0)} onChange={(e) => set(field.key, Number(e.target.value))} data-testid={`field-${field.key}`} />;
    case "date": return <input className={styles.input} type="date" value={String(v ?? "")} onChange={(e) => set(field.key, e.target.value || undefined)} data-testid={`field-${field.key}`} />;
    case "textarea": return <textarea className={styles.input} rows={6} value={String(v ?? "")} onChange={(e) => set(field.key, e.target.value)} data-testid={`field-${field.key}`} />;
    case "switch": return <label className={styles.checkRow}><input type="checkbox" checked={v !== false && !!v} onChange={(e) => set(field.key, e.target.checked)} data-testid={`field-${field.key}`} /> {t(`dashboards.field.${field.key}`)}</label>;
    case "filters": return <FilterEditor columns={columns} rules={(v as Rule[]) ?? []} onChange={(r) => set(field.key, r)} />;
    case "metrics": return <MetricsEditor value={(v as never) ?? []} onChange={(x) => set(field.key, x)} columns={columns} />;
    default: return <input className={styles.input} value={String(v ?? "")} onChange={(e) => set(field.key, e.target.value)} data-testid={`field-${field.key}`} />;
  }
}

/** Right-hand drawer to configure one widget (generic, driven by the widget's `fields`), with a live preview. */
export function WidgetSettings({ widget, columns, dashboardBoardIds, dashboardId, onSave, onClose }: {
  widget: WidgetDto; columns: ColumnsPayload; dashboardBoardIds: string[]; dashboardId: string;
  onSave: (patch: { title: string; settings: Settings }) => Promise<void>; onClose: () => void;
}) {
  const t = useT();
  const def = getWidgetDefinition(widget.type);
  const [title, setTitle] = useState(widget.title);
  const [settings, setSettings] = useState<Settings>(widget.settings);
  const [preview, setPreview] = useState<WidgetResultDto | null>(null);
  const [saving, setSaving] = useState(false);
  const seq = useRef(0);
  useEffect(() => {
    const n = ++seq.current;
    const h = setTimeout(() => {
      api.post<WidgetResultDto>("/api/v1/widgets/preview", { dashboardId, type: widget.type, settings }).then((r) => { if (n === seq.current) setPreview(r); }).catch(() => undefined);
    }, 300);
    return () => clearTimeout(h);
  }, [settings, widget.type, dashboardId]);
  if (!def) return null;
  const Renderer = widgetComponents[widget.type];
  const set = (k: string, v: unknown) => setSettings((s) => ({ ...s, [k]: v }));
  const visible = def.fields.filter((f) => !f.showIf || f.showIf.in.includes(String(settings[f.showIf.key] ?? "")));
  return (
    <aside className={styles.drawer} data-testid="widget-settings" aria-label={t("dashboards.widgetSettings")}>
      <div className={styles.drawerHead}>{t(`dashboards.w.${widget.type}`)}<IconButton icon={Close} kind="tertiary" size="small" aria-label={t("common.close")} onClick={onClose} /></div>
      <div className={styles.drawerBody}>
        <div className={styles.field}><label>{t("dashboards.widgetTitle")}</label><input className={styles.input} value={title} onChange={(e) => setTitle(e.target.value)} data-testid="widget-title-input" /></div>
        {visible.map((f) => (
          <div key={f.key} className={styles.field} data-testid={`field-wrap-${f.key}`}>
            {f.kind !== "switch" && <label>{t(`dashboards.field.${f.key}`)}</label>}
            <FieldInput field={f} settings={settings} set={set} columns={columns} boardIds={dashboardBoardIds} />
          </div>
        ))}
        <div className={styles.preview} data-testid="widget-preview">{preview?.ok && Renderer ? <Renderer data={preview.data} settings={settings} openItem={() => undefined} /> : preview && !preview.ok ? <div className={styles.widgetError}>{preview.error}</div> : null}</div>
        <Button loading={saving} onClick={async () => { setSaving(true); try { await onSave({ title, settings }); } finally { setSaving(false); } }} data-testid="widget-save">{t("common.save")}</Button>
      </div>
    </aside>
  );
}
