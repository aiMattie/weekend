"use client";

import { useT } from "@/lib/i18n/client";
import { NOTE_COLORS } from "./model";
import styles from "./whiteboard.module.css";

export type Tool = "select" | "note" | "rect" | "ellipse" | "diamond" | "text" | "connector" | "pen" | "image";

const TOOLS: { id: Tool; icon: string; key: string }[] = [
  { id: "select", icon: "↖", key: "docs.wb.select" },
  { id: "note", icon: "▤", key: "docs.wb.note" },
  { id: "rect", icon: "▭", key: "docs.wb.rect" },
  { id: "ellipse", icon: "◯", key: "docs.wb.ellipse" },
  { id: "diamond", icon: "◇", key: "docs.wb.diamond" },
  { id: "text", icon: "T", key: "docs.wb.text" },
  { id: "connector", icon: "↗", key: "docs.wb.connector" },
  { id: "pen", icon: "✎", key: "docs.wb.pen" },
  { id: "image", icon: "▣", key: "docs.wb.image" },
];

export function Toolbar(p: {
  tool: Tool; onTool: (t: Tool) => void; color: string; onColor: (c: string) => void; hasSelection: boolean; canUndo: boolean;
  onDelete: () => void; onDuplicate: () => void; onUndo: () => void;
}) {
  const t = useT();
  return (
    <>
      <div className={styles.toolbar} data-testid="wb-toolbar" role="toolbar">
        {TOOLS.map((x) => (
          <button key={x.id} type="button" className={`${styles.tool} ${p.tool === x.id ? styles.toolOn : ""}`} title={t(x.key)} aria-label={t(x.key)} aria-pressed={p.tool === x.id} data-testid={`wb-tool-${x.id}`} onClick={() => p.onTool(x.id)}>{x.icon}</button>
        ))}
        <div className={styles.toolSep} />
        <button type="button" className={styles.tool} disabled={!p.hasSelection} title={t("docs.wb.duplicate")} aria-label={t("docs.wb.duplicate")} data-testid="wb-duplicate" onClick={p.onDuplicate}>{"❐"}</button>
        <button type="button" className={styles.tool} disabled={!p.hasSelection} title={t("docs.wb.delete")} aria-label={t("docs.wb.delete")} data-testid="wb-delete" onClick={p.onDelete}>{"✕"}</button>
        <button type="button" className={styles.tool} disabled={!p.canUndo} title={t("docs.wb.undo")} aria-label={t("docs.wb.undo")} data-testid="wb-undo" onClick={p.onUndo}>{"↶"}</button>
      </div>
      <div className={styles.colors} data-testid="wb-colors">
        {NOTE_COLORS.map((c) => (
          <button key={c} type="button" className={`${styles.color} ${p.color === c ? styles.colorOn : ""}`} style={{ background: c }} aria-label={`${t("docs.wb.color")} ${c}`} data-testid="wb-color" onClick={() => p.onColor(c)} />
        ))}
      </div>
    </>
  );
}
