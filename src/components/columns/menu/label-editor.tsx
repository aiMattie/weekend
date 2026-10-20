"use client";

import { Modal, ModalContent, ModalFooter, ModalHeader } from "@vibe/core";
import { useState } from "react";
import { Popover } from "@/components/board/ui/popover";
import type { ColumnDto } from "@/lib/board-types";
import { WEEKEND_COLORS, contrastText } from "@/lib/colors";
import { useT } from "@/lib/i18n/client";
import { DialogRoot } from "./dialog-root";
import pack from "../pack.module.css";
import css from "./menu.module.css";

type Row = { id: number; text: string; color: string; isDone: boolean };

/**
 * Edit the labels of a status or dropdown column: add, rename, recolor (palette), reorder (drag or
 * arrows), mark as done (status), delete. Saves `settings.labels` through `onSave`.
 */
export function LabelEditor({ column, onSave, onClose }: { column: ColumnDto; onSave: (labels: unknown[]) => void; onClose: () => void }) {
  return <DialogRoot><LabelEditorInner column={column} onSave={onSave} onClose={onClose} /></DialogRoot>;
}

function LabelEditorInner({ column, onSave, onClose }: { column: ColumnDto; onSave: (labels: unknown[]) => void; onClose: () => void }) {
  const t = useT();
  const isStatus = column.type === "status";
  const initial = ((column.settings.labels as { id: number; text: string; color?: string; isDone?: boolean }[] | undefined) ?? []).map((l, i): Row => ({
    id: l.id, text: l.text, color: l.color ?? WEEKEND_COLORS[(i * 3 + 2) % WEEKEND_COLORS.length].hex, isDone: !!l.isDone,
  }));
  const [rows, setRows] = useState<Row[]>(initial);
  const [pick, setPick] = useState<{ id: number; el: HTMLElement } | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const patch = (id: number, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const move = (id: number, delta: number) => setRows((rs) => {
    const i = rs.findIndex((r) => r.id === id);
    const j = i + delta;
    if (j < 0 || j >= rs.length) return rs;
    const next = [...rs];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
  const add = () => setRows((rs) => {
    const id = rs.reduce((m, r) => Math.max(m, r.id), -1) + 1;
    return [...rs, { id, text: "", color: WEEKEND_COLORS[(rs.length * 3 + 2) % WEEKEND_COLORS.length].hex, isDone: false }];
  });
  const dropOn = (targetId: number) => {
    if (dragId === null || dragId === targetId) return;
    setRows((rs) => {
      const from = rs.findIndex((r) => r.id === dragId);
      const to = rs.findIndex((r) => r.id === targetId);
      const next = [...rs];
      const [m] = next.splice(from, 1);
      next.splice(to, 0, m);
      return next;
    });
    setDragId(null);
  };
  const save = () => {
    const texts = rows.filter((r) => r.text.trim()).map((r) => r.text.trim().toLowerCase());
    if (new Set(texts).size !== texts.length) return setError(t("col.labels.duplicate"));
    const kept = isStatus ? rows : rows.filter((r) => r.text.trim());
    onSave(isStatus
      ? kept.map((r, i) => ({ id: r.id, text: r.text.trim(), color: r.color, index: i, isDone: r.isDone }))
      : kept.map((r) => ({ id: r.id, text: r.text.trim() })));
    onClose();
  };

  return (
    <Modal id="label-editor" show size="medium" onClose={onClose}>
      <ModalHeader title={t("col.labels.title", { name: column.title })} />
      <ModalContent>
        <div className={css.labelList} data-testid="label-editor">
          {rows.map((r, i) => (
            <div key={r.id} className={css.labelRow} data-testid="label-row" draggable onDragStart={() => setDragId(r.id)} onDragOver={(e) => e.preventDefault()} onDrop={() => dropOn(r.id)}>
              <span className={css.dragHandle} aria-hidden>{"⋮⋮"}</span>
              {isStatus ? (
                <button type="button" className={css.colorBtn} style={{ background: r.color }} data-testid="label-color-btn" aria-label={t("col.labels.color")} onClick={(e) => setPick(pick?.id === r.id ? null : { id: r.id, el: e.currentTarget })} />
              ) : null}
              <input className={css.labelInput} value={r.text} placeholder={t("col.labels.placeholder")} data-testid="label-text" style={isStatus ? { background: r.color, color: contrastText(r.color) } : undefined} onChange={(e) => patch(r.id, { text: e.target.value })} />
              {isStatus ? (
                <label className={css.doneFlag} title={t("col.labels.doneHint")}>
                  <input type="checkbox" checked={r.isDone} data-testid="label-done" onChange={(e) => patch(r.id, { isDone: e.target.checked })} /> {t("col.labels.done")}
                </label>
              ) : null}
              <button type="button" className={pack.iconBtn} aria-label={t("col.labels.up")} disabled={i === 0} data-testid="label-up" onClick={() => move(r.id, -1)}>{"↑"}</button>
              <button type="button" className={pack.iconBtn} aria-label={t("col.labels.down")} disabled={i === rows.length - 1} data-testid="label-down" onClick={() => move(r.id, 1)}>{"↓"}</button>
              <button type="button" className={pack.iconBtn} aria-label={t("common.delete")} data-testid="label-delete" onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}>{"✕"}</button>
            </div>
          ))}
        </div>
        <button type="button" className={css.addLabel} data-testid="label-add" onClick={add}>+ {t("col.labels.add")}</button>
        {error ? <div className={pack.err2}>{error}</div> : null}
        {pick ? (
          <Popover anchorEl={pick.el} onClose={() => setPick(null)}>
            <div className={pack.palette} data-testid="label-palette">
              {WEEKEND_COLORS.map((c) => (
                <button key={c.hex} type="button" aria-label={c.name} data-testid={`label-color-${c.hex.slice(1)}`} className={`${pack.paletteItem} ${rows.find((r) => r.id === pick.id)?.color === c.hex ? pack.paletteOn : ""}`} style={{ background: c.hex }} onClick={() => { patch(pick.id, { color: c.hex }); setPick(null); }} />
              ))}
            </div>
          </Popover>
        ) : null}
      </ModalContent>
      <ModalFooter primaryButton={{ text: t("common.save"), onClick: save }} secondaryButton={{ text: t("common.cancel"), onClick: onClose }} />
    </Modal>
  );
}
