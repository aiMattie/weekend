"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api-client";
import type { NavData } from "@/lib/board-types";
import { useT } from "@/lib/i18n/client";
import { ChromeModal } from "./modal";
import { duplicateBoard, moveBoard, notifyNavChanged } from "./ops";
import styles from "./chrome.module.css";

export function useNav(): NavData | null {
  const [nav, setNav] = useState<NavData | null>(null);
  useEffect(() => {
    let alive = true;
    api.get<NavData>("/api/v1/nav").then((n) => alive && setNav(n)).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  return nav;
}

/** Workspace + optional folder pickers (folders of the chosen workspace). */
export function LocationPicker({ nav, workspaceId, folderId, onChange, idPrefix }: { nav: NavData | null; workspaceId: string; folderId: string | null; onChange: (ws: string, folder: string | null) => void; idPrefix: string }) {
  const t = useT();
  const folders = useMemo(() => (nav?.folders ?? []).filter((f) => f.workspaceId === workspaceId), [nav, workspaceId]);
  return (
    <div className={styles.row}>
      <label className={styles.field}>
        <span className={styles.label}>{t("chrome.workspace")}</span>
        <select className={styles.select} value={workspaceId} onChange={(e) => onChange(e.target.value, null)} data-testid={`${idPrefix}-workspace`}>
          {(nav?.workspaces ?? []).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </label>
      <label className={styles.field}>
        <span className={styles.label}>{t("chrome.folder")}</span>
        <select className={styles.select} value={folderId ?? ""} onChange={(e) => onChange(workspaceId, e.target.value || null)} data-testid={`${idPrefix}-folder`}>
          <option value="">{t("chrome.noFolder")}</option>
          {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </label>
    </div>
  );
}

export function MoveBoardDialog({ boardId, name, workspaceId, folderId, onClose, onDone }: { boardId: string; name: string; workspaceId: string; folderId: string | null; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const nav = useNav();
  const [loc, setLoc] = useState({ ws: workspaceId, folder: folderId });
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    try {
      await moveBoard(boardId, { workspaceId: loc.ws, folderId: loc.folder });
      notifyNavChanged();
      onDone();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  };
  return (
    <ChromeModal id="move-board-dialog" title={t("chrome.moveTitle", { name })} onClose={onClose} error={error} primary={{ text: t("chrome.move"), onClick: () => void submit(), testId: "move-board-submit" }}>
      <div className={styles.form}>
        <LocationPicker nav={nav} workspaceId={loc.ws} folderId={loc.folder} onChange={(ws, folder) => setLoc({ ws, folder })} idPrefix="move-board" />
      </div>
    </ChromeModal>
  );
}

export function DuplicateBoardDialog({ boardId, name, onClose, onDone }: { boardId: string; name: string; onClose: () => void; onDone: (newId: string) => void }) {
  const t = useT();
  const [title, setTitle] = useState(t("chrome.copyOf", { name }));
  const [mode, setMode] = useState<"structure" | "items" | "updates">("items");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      const b = await duplicateBoard(boardId, { name: title.trim(), withItems: mode !== "structure", withUpdates: mode === "updates" });
      notifyNavChanged();
      onDone(b.id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
      setBusy(false);
    }
  };
  const opt = (v: typeof mode, label: string, hint: string) => (
    <label key={v} className={`${styles.radio} ${mode === v ? styles.radioOn : ""}`}>
      <input type="radio" name="dup-mode" checked={mode === v} onChange={() => setMode(v)} data-testid={`duplicate-${v}`} />
      <span><span className={styles.radioTitle}>{label}</span><br /><span className={styles.hint}>{hint}</span></span>
    </label>
  );
  return (
    <ChromeModal id="duplicate-board-dialog" title={t("chrome.duplicateTitle")} onClose={onClose} error={error} primary={{ text: t("common.duplicate"), onClick: () => void submit(), disabled: busy || !title.trim(), testId: "duplicate-submit" }}>
      <div className={styles.form}>
        <label className={styles.field}>
          <span className={styles.label}>{t("chrome.name")}</span>
          <input className={styles.input} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus data-testid="duplicate-name" />
        </label>
        <div className={styles.radioList}>
          {opt("structure", t("chrome.dupStructure"), t("chrome.dupStructureHint"))}
          {opt("items", t("chrome.dupItems"), t("chrome.dupItemsHint"))}
          {opt("updates", t("chrome.dupUpdates"), t("chrome.dupUpdatesHint"))}
        </div>
      </div>
    </ChromeModal>
  );
}
