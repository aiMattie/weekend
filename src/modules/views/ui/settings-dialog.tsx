"use client";

import { Modal, ModalContent, ModalFooter, ModalHeader, Toggle } from "@vibe/core";
import { useState } from "react";
import type { ColumnDto } from "@/lib/board-types";
import { useT } from "@/lib/i18n/client";
import { GROUP_AXIS } from "../lib/chart";
import { VIEW_FIELDS, itemColumns, strList, type FieldDef } from "../lib/settings";
import styles from "./views.module.css";

interface Props {
  open: boolean;
  type: string;
  viewName: string;
  columns: ColumnDto[];
  settings: Record<string, unknown>;
  onSave: (patch: Record<string, unknown>) => void;
  onClose: () => void;
}

/** Generic per-view settings dialog, driven by VIEW_FIELDS (src/modules/views/lib/settings.ts). */
export function ViewSettingsDialog(props: Props) {
  // Vibe Modal must not render during SSR; the inner component remounts per open (fresh draft).
  return props.open ? <Inner {...props} /> : null;
}

function Inner({ type, viewName, columns, settings, onSave, onClose }: Props) {
  const t = useT();
  const [draft, setDraft] = useState<Record<string, unknown>>({ ...settings });
  const fields = VIEW_FIELDS[type] ?? [];
  const set = (k: string, v: unknown) => setDraft((d) => ({ ...d, [k]: v }));
  const save = () => {
    const patch: Record<string, unknown> = {};
    for (const f of fields) if (f.key in draft) patch[f.key] = draft[f.key];
    onSave(patch);
    onClose();
  };
  return (
    <Modal id="view-settings" show size="medium" onClose={onClose}>
      <ModalHeader title={t("vw.settingsTitle", { name: viewName })} />
      <ModalContent>
        <div className={styles.settingsForm} data-testid="view-settings-dialog">
          {fields.map((f) => (
            <label key={f.key} className={styles.settingsRow} data-testid={`setting-${f.key}`}>
              <span className={styles.settingsLabel}>{t(f.label)}</span>
              <FieldInput field={f} columns={columns} value={draft[f.key]} onChange={(v) => set(f.key, v)} />
            </label>
          ))}
        </div>
      </ModalContent>
      <ModalFooter primaryButton={{ text: t("common.save"), onClick: save }} secondaryButton={{ text: t("common.cancel"), onClick: onClose }} />
    </Modal>
  );
}

function FieldInput({ field, columns, value, onChange }: { field: FieldDef; columns: ColumnDto[]; value: unknown; onChange: (v: unknown) => void }) {
  const t = useT();
  const cols = itemColumns(columns).filter((c) => !field.types?.length || field.types.includes(c.type));
  if (field.kind === "column") {
    return (
      <select className={styles.select} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} data-testid={`setting-input-${field.key}`}>
        <option value="">{t("vw.set.auto")}</option>
        {field.optional ? <option value="none">{t("vw.set.none")}</option> : null}
        {field.key === "xColumnId" ? <option value={GROUP_AXIS}>{t("vw.set.byGroup")}</option> : null}
        {cols.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
      </select>
    );
  }
  if (field.kind === "columns") {
    const sel = new Set(strList(value));
    return (
      <span className={styles.checkList}>
        {cols.map((c) => (
          <label key={c.id} className={styles.checkItem}>
            <input type="checkbox" checked={sel.has(c.id)} onChange={() => { const n = new Set(sel); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); onChange([...n]); }} data-testid={`setting-check-${c.key}`} />
            {c.title}
          </label>
        ))}
        {!cols.length ? <span className={styles.muted}>{t("vw.set.noColumns")}</span> : null}
      </span>
    );
  }
  if (field.kind === "select") {
    return (
      <select className={styles.select} value={typeof value === "string" ? value : field.options?.[0]?.value} onChange={(e) => onChange(e.target.value)} data-testid={`setting-input-${field.key}`}>
        {(field.options ?? []).map((o) => <option key={o.value} value={o.value}>{t(o.label)}</option>)}
      </select>
    );
  }
  if (field.kind === "number") {
    return <input className={styles.numberInput} type="number" min={field.min} max={field.max} value={typeof value === "number" ? value : ""} onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))} data-testid={`setting-input-${field.key}`} />;
  }
  return <Toggle isSelected={value === true} onChange={(on) => onChange(on)} data-testid={`setting-input-${field.key}`} />;
}
